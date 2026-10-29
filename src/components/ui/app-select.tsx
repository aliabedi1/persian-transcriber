import { Select } from '@base-ui/react/select'
import { Check, ChevronDown, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type SelectOption = {
  value: string
  label: string
  description?: string
  icon?: LucideIcon
  disabled?: boolean
}

type AppSelectProps = {
  id?: string
  'aria-label'?: string
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  icon?: LucideIcon
  disabled?: boolean
  className?: string
}

export function AppSelect({ options, value, onValueChange, icon: Icon, className, disabled, ...props }: AppSelectProps) {
  return (
    <Select.Root items={options} value={value} onValueChange={next => { if (next !== null) onValueChange(next) }} disabled={disabled} modal={false}>
      <Select.Trigger {...props} data-value={value} className={cn('app-select-trigger', className)}>
        {Icon && <Icon aria-hidden="true" className="app-select-icon" />}
        <Select.Value className="app-select-value" />
        <Select.Icon className="app-select-chevron"><ChevronDown aria-hidden="true" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={8} align="start" alignItemWithTrigger={false} className="app-select-positioner">
          <Select.Popup className="app-select-popup">
            <Select.List className="app-select-list">
              <Select.Group>
                {options.map(({ value: optionValue, label, description, icon: OptionIcon, disabled: optionDisabled }) => (
                  <Select.Item key={optionValue} value={optionValue} disabled={optionDisabled} data-value={optionValue} className="app-select-option">
                    {OptionIcon && <OptionIcon aria-hidden="true" className="app-select-option-icon" />}
                    <span className="app-select-copy">
                      <Select.ItemText>{label}</Select.ItemText>
                      {description && <span className="app-select-description">{description}</span>}
                    </span>
                    <Select.ItemIndicator className="app-select-check"><Check aria-hidden="true" /></Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Group>
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}
