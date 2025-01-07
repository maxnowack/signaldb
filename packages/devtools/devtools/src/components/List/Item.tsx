import React, { useCallback } from 'react'
import styled from 'styled-components'
import colors from '../../colorPalette'

const Wrapper = styled.li<{ $active?: boolean }>`
  font-size: 14px;
  font-weight: 400;
  background-color: ${props => props.$active ? colors.primary : 'transparent'};
  display: flex;
  a {
    padding: 8px 16px;
    color: ${props => props.$active ? colors.white : colors.lightGrey};
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`

interface Props {
  onClick?: () => void,
  active?: boolean,
  text: string,
}

/**
 * Item component that renders a list item with an optional click handler.
 * @param props - The component props.
 * @param props.active - Indicates if the item is active.
 * @param props.text - The text to be displayed inside the item.
 * @param [props.onClick] - Optional click handler for the item.
 * @returns The rendered list item component.
 */
const Item: React.FC<Props> = ({ text, active, onClick }) => {
  const handleClick = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    if (onClick) onClick()
  }, [onClick])
  return (
    <Wrapper $active={active}>
      <a href="#" onClick={handleClick} title={text}>
        {text}
      </a>
    </Wrapper>
  )
}

export default Item
