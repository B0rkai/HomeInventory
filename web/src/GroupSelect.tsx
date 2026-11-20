import type { ItemOut } from './api'
import { autoGroup, groupOrder, groupPath } from './groups'
import { useHouse } from './house'
import { t } from './strings'

/**
 * An item's group picker: "Automatikus (...)", what its icon suggests, then each group
 * followed by its subgroups ("Élelmiszer › Fűszer"). `null` is automatic.
 */
export function GroupSelect({
  item,
  value,
  onChange,
  label = t.items.category,
  disabled,
}: {
  // For the automatic one's name.
  item: Pick<ItemOut, 'name' | 'icon'>
  value: number | null
  onChange: (groupId: number | null) => void
  label?: string
  disabled?: boolean
}) {
  const { house } = useHouse()
  const groups = house?.groups ?? []
  return (
    <select
      className="group-select"
      aria-label={label}
      value={value ?? ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
    >
      <option value="">{t.items.categoryAuto(groupPath(autoGroup(item, groups), groups))}</option>
      {groupOrder(groups).map((group) => (
        <option key={group.id} value={group.id}>
          {groupPath(group, groups)}
        </option>
      ))}
    </select>
  )
}
