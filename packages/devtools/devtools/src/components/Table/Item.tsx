import React, { useEffect, useState } from 'react'
import styled from 'styled-components'
import colors from '../../colorPalette'
import ActionButton from './ActionButton'

const CellContent = styled.div``
const Wrapper = styled.tr<{ $expanded?: boolean }>`
  &:nth-child(even) {
    background-color: ${colors.black};
  }
  td {
    font-size: 14px;
    padding: 4px;
    text-align: left;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: ${colors.lightGrey};
    vertical-align: top;
    &.expandable {
      cursor: ${p => (p.$expanded ? 'n-resize' : 's-resize')};
    }
    ${CellContent} {
      white-space: ${p => (p.$expanded ? 'pre-wrap' : 'nowrap')};
      max-height: ${p => (p.$expanded ? 'none' : '25px')};
    }
    &:nth-child(2) {
      text-align: right;
      ${ActionButton} {
        margin-left: 8px;
      }
    }
  }
`
const Textarea = styled.textarea<{ $isValid: boolean }>`
  width: 100%;
  height: 300px;
  background-color: ${colors.darkGrey};
  color: ${colors.white};
  border-radius: 2px;
  border: 2px solid ${p => (p.$isValid ? colors.lightGrey : '#b34754')};
  outline: none;
`

interface Props<T extends Record<string, any>> {
  item?: T,
  columns?: { name: keyof T, label: string }[],
  onEdit?: (item: T) => Promise<void>,
  onCancel?: () => void,
  editMode?: boolean,
  onRemove?: () => Promise<void>,
  hasActions?: boolean,
}

const Item = <T extends Record<string, any>>({
  item,
  columns,
  onEdit,
  onCancel,
  editMode: editModeProperty,
  onRemove,
  hasActions,
}: Props<T>) => {
  const [expanded, setExpanded] = useState(false)
  const [editMode, setEditMode] = useState(editModeProperty)
  const [itemValue, setItemValue] = useState(() => JSON.stringify(item || {}))
  const [isValid, setIsValid] = useState(true)

  useEffect(() => {
    if (editMode) return
    setItemValue(JSON.stringify(item || {}))
  }, [item, editMode])
  return (
    <Wrapper $expanded={expanded}>
      {editMode || !columns
        ? (
          <td
            title={editMode ? '' : itemValue}
            colSpan={columns ? columns.length : undefined}
          >
            {editMode
              ? (
                <Textarea
                  $isValid={isValid}
                  defaultValue={itemValue}
                  onChange={(event) => {
                    const { value } = event.target
                    setItemValue(value)
                    try {
                      JSON.parse(value)
                      setIsValid(true)
                    } catch {
                      setIsValid(false)
                    }
                  }}
                />
              )
              : itemValue}
          </td>
        )
        : (
          <>
            {columns.map(column => (
              <td
                key={column.name as string}
                className="expandable"
                onClick={() => setExpanded(!expanded)}
              >
                <CellContent>
                  {item?.[column.name]}
                </CellContent>
              </td>
            ))}
          </>
        )}
      {hasActions && (
        <td>
          {editMode && onEdit
            ? (
              <>
                <ActionButton
                  disabled={!isValid}
                  onClick={() => {
                    try {
                      const parsedItem = JSON.parse(itemValue) as T
                      onEdit(parsedItem)
                        .then(() => setEditMode(false))
                        .catch(() => setIsValid(false))
                    } catch {
                      setIsValid(false)
                    }
                  }}
                >
                  ✅
                </ActionButton>
                <ActionButton
                  onClick={() => {
                    if (onCancel) onCancel()
                    setEditMode(false)
                  }}
                >
                  ❌
                </ActionButton>
              </>
            )
            : (
              <>
                {onEdit && (
                  <ActionButton
                    onClick={() => {
                      setEditMode(true)
                      setItemValue(JSON.stringify(item || {}, null, 2))
                    }}
                  >
                    ✏️
                  </ActionButton>
                )}
                {onRemove && (
                  <ActionButton
                    onClick={() => {
                      void onRemove()
                    }}
                  >
                    🗑️
                  </ActionButton>
                )}
              </>
            )}
        </td>
      )}
    </Wrapper>
  )
}

export default Item
