import React, { useState } from 'react'
import styled from 'styled-components'
import colors from '../../colorPalette'
import ActionButton from './ActionButton'
import Item from './Item'

const Wrapper = styled.div`
  position: relative;
  table {
    width: 100%;
    table-layout: fixed;
    thead {
      background-color: ${colors.darkGrey};
      position: sticky;
      top: 0;
    }
    th {
      background-color: ${colors.black};
      color: ${colors.white};
      white-space: nowrap;
      &.small {
        width: 100px;
        text-align: right;
      }
    }
  }
`
const Placeholder = styled.p`
  margin: 0;
  font-style: italic;
  color: ${colors.lightGrey};
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
`

type Props<T extends Record<string, any>> = {
  items: T[],
  onAdd?: (item: T) => Promise<void>,
  onEdit?: (id: string, item: T) => Promise<void>,
  onRemove?: (id: string) => Promise<void>,
  placeholder?: string,
  className?: string,
} & ({
  columns: { name: keyof T, label: string }[],
  itemColumn?: never,
} | {
  columns?: never,
  itemColumn: string,
})

const Table = <T extends Record<string, any>>({
  items,
  onAdd,
  onEdit,
  onRemove,
  columns,
  itemColumn = 'Item',
  placeholder,
  className,
}: Props<T>) => {
  const [insertionMode, setInsertionMode] = useState(false)
  const hasActions = Boolean(onAdd || onEdit || onRemove)
  return (
    <Wrapper className={className}>
      {items.length === 0 && placeholder
        ? <Placeholder>{placeholder}</Placeholder>
        : (
          <table>
            <thead>
              <tr>
                {!columns && itemColumn && <th>{itemColumn}</th>}
                {columns?.map(column => (
                  <th key={column.name as string}>{column.label}</th>
                ))}
                {hasActions && (
                  <th className="small">
                    <ActionButton onClick={() => setInsertionMode(true)}>
                      ➕
                    </ActionButton>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {insertionMode && onAdd && (
                <Item
                  editMode
                  hasActions
                  columns={columns}
                  onEdit={async (item) => {
                    setInsertionMode(false)
                    await onAdd(item)
                  }}
                  onCancel={() => setInsertionMode(false)}
                />
              )}
              {items.map(item => (
                <Item
                  key={item.id}
                  item={item}
                  columns={columns}
                  onEdit={onEdit && item.id
                    ? newItem => onEdit(item.id as string, newItem)
                    : undefined}
                  onRemove={onRemove && item.id
                    ? () => onRemove(item.id as string)
                    : undefined}
                  hasActions={hasActions}
                />
              ))}
            </tbody>
          </table>
        )}
    </Wrapper>
  )
}

export default Table
