import { UNDO_DELAY, useHouse } from './house'
import { t } from './strings'

/** The last change, for a few seconds: undo it before it's sent and anyone is told. */
export function UndoBar() {
  const { undoable, actions } = useHouse()
  if (!undoable) return null
  return (
    // A new change restarts the countdown.
    <div key={undoable.id} className="undo-bar" role="status">
      <span>{undoable.label}</span>
      <button type="button" className="undo-button" onClick={actions.undo}>
        {t.undo.undo}
      </button>
      <span className="undo-timer" style={{ animationDuration: `${UNDO_DELAY}ms` }} />
    </div>
  )
}
