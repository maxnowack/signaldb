import React, { useEffect, useState } from 'react'
import styled from 'styled-components'
import colors from '../../colorPalette'
import ActionButton from './ActionButton'

const Wrapper = styled.tr`
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

interface Props {
  item?: Record<string, any>,
  onEdit?: (item: Record<string, any>) => void,
  onCancel?: () => void,
  editMode?: boolean,
  onRemove?: () => void,
  hasActions?: boolean,
}

const Item: React.FC<Props> = ({
  item,
  onEdit,
  onCancel,
  editMode: editModeProperty,
  onRemove,
  hasActions,
}) => {
  const [editMode, setEditMode] = useState(editModeProperty)
  const [itemValue, setItemValue] = useState(() => JSON.stringify(item || {}))
  const [isValid, setIsValid] = useState(true)

  useEffect(() => {
    if (editMode) return
    setItemValue(JSON.stringify(item || {}))
  }, [item, editMode])
  return (
    <Wrapper>
      <td title={editMode ? '' : itemValue}>
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
      {hasActions && (
        <td>
          {editMode && onEdit
            ? (
              <>
                <ActionButton
                  disabled={!isValid}
                  onClick={() => {
                    try {
                      const parsedItem = JSON.parse(itemValue) as Record<string, any>
                      onEdit(parsedItem)
                      setEditMode(false)
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
                {onRemove && <ActionButton onClick={onRemove}>🗑️</ActionButton>}
              </>
            )}
        </td>
      )}
    </Wrapper>
  )
}

export default Item
