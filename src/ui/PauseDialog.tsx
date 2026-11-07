import { useLayoutEffect, useRef } from 'react'

interface PauseDialogProps {
  resume: () => void
  exit: () => void
}

export function PauseDialog({ resume, exit }: PauseDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      className="pause-dialog"
      ref={dialogRef}
      aria-labelledby="pause-title"
      onCancel={(event) => {
        event.preventDefault()
        resume()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        if (!event.repeat) resume()
      }}
    >
      <h2 id="pause-title">Partida en pausa</h2>
      <div className="arcade-actions">
        <button type="button" onClick={resume}>
          Continuar
        </button>
        <button type="button" onClick={exit}>
          Salir al menú
        </button>
      </div>
    </dialog>
  )
}
