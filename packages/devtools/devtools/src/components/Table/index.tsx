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
      &:nth-child(2) {
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

interface Props {
  items: (Record<string, any>)[],
  onAdd?: (item: Record<string, any>) => void,
  onEdit?: (id: string, item: Record<string, any>) => void,
  onRemove?: (id: string) => void,
  placeholder?: string,
  className?: string,
  itemColumn?: string,
}

const Table: React.FC<Props> = ({
  items,
  onAdd,
  onEdit,
  onRemove,
  itemColumn = 'Item',
  placeholder,
  className,
}) => {
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
                <th>{itemColumn}</th>
                {hasActions && (
                  <th>
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
                  onEdit={(item) => {
                    setInsertionMode(false)
                    onAdd(item)
                  }}
                  onCancel={() => setInsertionMode(false)}
                />
              )}
              {items.map(item => (
                <Item
                  key={item.id}
                  item={item}
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
