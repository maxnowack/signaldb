import React from 'react'
import styled from 'styled-components'
import Item from './Item'

const Wrapper = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
`

interface Props {
  items: { id: string, title: string, onClick?: () => void }[],
  active?: string,
  className?: string,
}

/**
 * List component that renders a list of items.
 * @param props - The component props.
 * @param props.active - The active item id.
 * @param props.className - The component class name.
 * @param props.items - The list of items to be displayed.
 * @returns The rendered list component.
 */
const List: React.FC<Props> = ({ items, active, className }) => (
  <Wrapper className={className}>
    {items.map(({ id, title, onClick }) => (
      <Item
        key={id}
        onClick={onClick}
        active={id === active}
        text={title}
      />
    ))}
  </Wrapper>
)

export default List
