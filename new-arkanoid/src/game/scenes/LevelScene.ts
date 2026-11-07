import Phaser from 'phaser'
import { useGameStore } from '@/state/gameStore'
import {
  ballDrain,
  INITIAL_LIVES,
  MAX_BALLS,
  paddleRebound,
  POINTS_PER_BRICK,
} from '../levelRules'
import { loadLevel } from '../levels/level'
import levelData from '../levels/level_01.json'

type ArcadeBody = Phaser.Physics.Arcade.Body
type Moving<T extends Phaser.GameObjects.GameObject> = T & { body: ArcadeBody }
type Ball = Moving<Phaser.GameObjects.Arc>
type Block = Phaser.GameObjects.Rectangle

type PlayPhase = 'ready' | 'playing' | 'finished'

const BOARD_TOP = 62
const PADDLE_WIDTH = 90
const PADDLE_HEIGHT = 16
const PADDLE_SPEED = 460
const POINTER_SPEED = 1_260
const BALL_RADIUS = 8
const EMPTY_LANE_DEFLECTION = 150
const BONUS_SPEED = 120
const STEP_SECONDS = 1 / 60
const BRICK_WIDTH = 54
const BRICK_HEIGHT = 20
const BRICK_SPACING = 58
const FIRST_ROW_Y = 116
const ROW_SPACING = 26

export class LevelScene extends Phaser.Scene {
  private phase: PlayPhase = 'ready'
  private paddle!: Moving<Block>
  private balls: Ball[] = []
  private bonus!: Moving<Block>
  private launchHint!: Phaser.GameObjects.Text
  private bricksRemaining = 0
  private pointerX: number | null = null
  private paddleY = 0
  private left: Phaser.Input.Keyboard.Key | undefined
  private right: Phaser.Input.Keyboard.Key | undefined

  constructor() {
    super('Level')
  }

  create(): void {
    const store = useGameStore.getState()
    store.setOutcome(null)
    store.setScore(0)
    store.setLives(INITIAL_LIVES)

    const { width, height } = this.scale.gameSize
    this.paddleY = height - 32
    this.cameras.main.setBackgroundColor('#080c1d')
    this.add.rectangle(width / 2, BOARD_TOP, width, 2, 0x375188)
    this.physics.world.setBounds(
      0,
      BOARD_TOP,
      width,
      height - BOARD_TOP,
      true,
      true,
      true,
      false,
    )

    this.paddle = this.makeMoving(
      this.add
        .rectangle(
          width / 2,
          this.paddleY,
          PADDLE_WIDTH,
          PADDLE_HEIGHT,
          0x6cefe7,
        )
        .setStrokeStyle(2, 0xebfffb),
    )
    this.paddle.body
      .setImmovable(true)
      .setFrictionX(0)
      .setCollideWorldBounds(true)

    this.balls = Array.from({ length: MAX_BALLS }, () => {
      const ball = this.makeMoving(
        this.add.circle(width / 2, this.attachedBallY(), BALL_RADIUS, 0xfff6ce),
      )
      ball.body.setCircle(BALL_RADIUS)
      ball.body.setBounce(1, 1).setCollideWorldBounds(true)
      return ball
    })

    this.bonus = this.makeMoving(
      this.add.rectangle(0, 0, 30, 16, 0xb76dff).setStrokeStyle(2, 0xf5dfff),
    )
    this.deactivate(this.bonus)

    const level = loadLevel(levelData)
    const bricks = this.physics.add.staticGroup()
    const firstColumnX = width / 2 - 5.5 * BRICK_SPACING
    for (const brick of level) {
      const block = this.add
        .rectangle(
          firstColumnX + brick.column * BRICK_SPACING,
          FIRST_ROW_Y + brick.row * ROW_SPACING,
          BRICK_WIDTH,
          BRICK_HEIGHT,
          brick.color,
        )
        .setStrokeStyle(2, brick.multiball ? 0xf5dfff : 0x182139)
      block.setData('multiball', brick.multiball)
      bricks.add(block)
    }
    this.bricksRemaining = level.length

    for (const ball of this.balls) {
      this.physics.add.collider(
        ball,
        this.paddle,
        () => this.bounceFromPaddle(ball),
        () =>
          ball.body.velocity.y > 0 &&
          ball.body.center.y < this.paddle.body.center.y,
      )
      this.physics.add.collider(ball, bricks, (_, brick) =>
        this.hitBrick(brick as Block),
      )
    }
    this.physics.add.overlap(
      this.paddle,
      this.bonus,
      this.collectBonus,
      undefined,
      this,
    )

    this.launchHint = this.add
      .text(width / 2, height - 125, 'Espacio o toque para lanzar', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#f1f5ff',
      })
      .setOrigin(0.5)

    this.prepareServe()
    this.bindControls()
    this.events.on(Phaser.Scenes.Events.PRE_UPDATE, this.updatePaddle, this)
    this.physics.world.on(
      Phaser.Physics.Arcade.Events.WORLD_STEP,
      this.afterPhysicsStep,
      this,
    )
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.PRE_UPDATE, this.updatePaddle, this)
      this.input.off('pointermove', this.movePointer, this)
      this.input.off('pointerdown', this.pressPointer, this)
    })

    store.setStatus('level')
  }

  private makeMoving<T extends Phaser.GameObjects.GameObject>(
    object: T,
  ): Moving<T> {
    this.physics.add.existing(object)
    const moving = object as Moving<T>
    moving.body.setAllowGravity(false)
    return moving
  }

  private deactivate(object: Moving<Phaser.GameObjects.Shape>): void {
    object.body.stop()
    object.body.enable = false
    object.setVisible(false)
  }

  private bindControls(): void {
    const keyboard = this.input.keyboard
    this.left = keyboard?.addKey('LEFT', false)
    this.right = keyboard?.addKey('RIGHT', false)
    keyboard?.addKey('SPACE', false).on('down', this.launch, this)
    this.input.on('pointermove', this.movePointer, this)
    this.input.on('pointerdown', this.pressPointer, this)
  }

  private movePointer(pointer: Phaser.Input.Pointer): void {
    if (this.phase !== 'finished') this.pointerX = pointer.x
  }

  private pressPointer(pointer: Phaser.Input.Pointer): void {
    this.movePointer(pointer)
    if (this.phase === 'ready') {
      this.paddle.body.reset(this.clampPaddleX(pointer.x), this.paddleY)
      this.launch()
    }
  }

  private clampPaddleX(x: number): number {
    return Phaser.Math.Clamp(
      x,
      PADDLE_WIDTH / 2,
      this.scale.gameSize.width - PADDLE_WIDTH / 2,
    )
  }

  private updatePaddle(): void {
    if (this.phase === 'finished') return
    const direction =
      Number(this.right?.isDown ?? false) - Number(this.left?.isDown ?? false)
    if (direction !== 0) this.pointerX = null
    if (this.pointerX === null) {
      this.paddle.body.setVelocityX(direction * PADDLE_SPEED)
      return
    }

    const distance =
      this.clampPaddleX(this.pointerX) - this.paddle.body.center.x
    this.paddle.body.setVelocityX(
      Phaser.Math.Clamp(distance / STEP_SECONDS, -POINTER_SPEED, POINTER_SPEED),
    )
  }

  private prepareServe(): void {
    this.phase = 'ready'
    this.pointerX = null
    this.paddle.body.reset(this.scale.gameSize.width / 2, this.paddleY)
    this.balls.forEach((ball) => this.deactivate(ball))
    this.moveAttachedBall()
    this.launchHint.setVisible(true)
  }

  private attachedBallY(): number {
    return this.paddleY - PADDLE_HEIGHT / 2 - BALL_RADIUS - 3
  }

  private moveAttachedBall(): void {
    this.balls[0]
      ?.setPosition(this.paddle.body.center.x, this.attachedBallY())
      .setVisible(true)
  }

  private launch(): void {
    const ball = this.balls[0]
    if (this.phase !== 'ready' || ball === undefined) return
    this.phase = 'playing'
    this.launchHint.setVisible(false)
    ball.body.reset(this.paddle.body.center.x, this.attachedBallY())
    ball.body.enable = true
    ball.body.setVelocity(150, -400)
  }

  private bounceFromPaddle(ball: Ball): void {
    if (this.phase !== 'playing') return
    const offset =
      (ball.body.center.x - this.paddle.body.center.x) / (PADDLE_WIDTH / 2)
    const { x, y } = paddleRebound(offset)
    let horizontal: number = x
    if (horizontal === 0 && !this.hasBrickAbove(ball.body)) {
      const isLeftHalf = ball.body.center.x < this.scale.gameSize.width / 2
      horizontal = isLeftHalf ? EMPTY_LANE_DEFLECTION : -EMPTY_LANE_DEFLECTION
    }
    ball.body.setVelocity(horizontal, y)
    this.game.events.emit('arkanoid:sfx', 'bounce')
  }

  private hasBrickAbove(ball: ArcadeBody): boolean {
    // Only the bricks are static bodies. Disabled bodies may remain in the
    // tree until Phaser finishes the current step.
    return this.physics
      .overlapRect(
        ball.left,
        BOARD_TOP,
        ball.width,
        ball.top - BOARD_TOP,
        false,
        true,
      )
      .some(
        (brick) =>
          brick.enable && brick.left < ball.right && brick.right > ball.left,
      )
  }

  private hitBrick(brick: Block): void {
    if (this.phase !== 'playing' || !brick.active) return
    const { x, y } = brick
    const dropsBonus = brick.getData('multiball') === true
    brick.destroy()
    this.bricksRemaining -= 1
    const store = useGameStore.getState()
    store.setScore(store.score + POINTS_PER_BRICK)
    this.game.events.emit('arkanoid:sfx', 'brick_bounce')

    if (dropsBonus && this.bricksRemaining > 0) {
      this.bonus.body.reset(x, y)
      this.bonus.body.enable = true
      this.bonus.body.setVelocityY(BONUS_SPEED)
      this.bonus.setVisible(true)
    }
  }

  private collectBonus(): void {
    if (this.phase !== 'playing' || !this.bonus.body.enable) return
    this.deactivate(this.bonus)
    for (const [index, ball] of this.balls.entries()) {
      if (ball.body.enable) continue
      const direction = index === 1 ? -1 : 1
      const x = Phaser.Math.Clamp(
        this.paddle.body.center.x + direction * 12,
        BALL_RADIUS,
        this.scale.gameSize.width - BALL_RADIUS,
      )
      ball.body.reset(x, this.attachedBallY())
      ball.body.enable = true
      ball.body.setVelocity(direction * 250, -350)
      ball.setVisible(true)
    }
    this.game.events.emit('arkanoid:sfx', 'bonus')
  }

  private afterPhysicsStep(): void {
    if (this.phase === 'ready') {
      this.moveAttachedBall()
      return
    }
    if (this.phase !== 'playing') return
    if (this.bricksRemaining === 0) {
      this.finish('won')
      return
    }

    const bottom = this.scale.gameSize.height
    if (this.bonus.body.enable && this.bonus.body.top >= bottom)
      this.deactivate(this.bonus)
    let activeBalls = 0
    for (const ball of this.balls) {
      if (!ball.body.enable) continue
      if (ball.body.top >= bottom) this.deactivate(ball)
      else activeBalls += 1
    }

    const store = useGameStore.getState()
    const drain = ballDrain(activeBalls, store.lives, store.score)
    if (drain === null) return
    store.setLives(drain.lives)
    store.setScore(drain.score)
    this.game.events.emit('arkanoid:sfx', 'life_lost')
    this.deactivate(this.bonus)
    if (drain.lives === 0) this.finish('lost')
    else this.prepareServe()
  }

  private finish(outcome: 'won' | 'lost'): void {
    this.phase = 'finished'
    this.paddle.body.stop()
    this.deactivate(this.bonus)
    this.balls.forEach((ball) => this.deactivate(ball))
    if (outcome === 'won') this.game.events.emit('arkanoid:sfx', 'level_up')
    useGameStore.getState().setOutcome(outcome)
  }
}
