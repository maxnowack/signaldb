import React from 'react'
import styled from 'styled-components'
import Logo from '../components/Logo'
import colors from '../colorPalette'
import settingsStore from '../models/settingsStore'
import Badge from './Badge'

const Wrapper = styled.button.attrs({ type: 'button' })`
  background-color: ${colors.darkGrey};
  border-radius: 8px;
  border: 2px solid ${colors.lightGrey};
  position: fixed;
  bottom: 20px;
  left: 45px;
  width: 48px;
  height: 48px;
  z-index: 10;
  transition-duration: 0.3s;
  cursor: pointer;
  svg {
    transition-duration: 0.3s;
    width: 100%;
    height: 100%;
    fill: ${colors.lightGrey};
  }
  &:hover {
    background-color: ${colors.primary};
    border-color: ${colors.white};
    svg {
      fill: ${colors.white};
    }
  }
  @media (max-width: 768px) {
    left: 20px;
  }
`

/**
 * Button component renders a button that opens SignalDB DevTools.
 * @param props - Component props
 * @param props.onClick - Function to call when the button is clicked
 * @returns The Button component
 */
const Button: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const settings = settingsStore.use()
  if (!settings.showButton) return null
  return (
    <Wrapper
      title="Open SignalDB DevTools (Ctrl+Shift+S)"
      onClick={onClick}
    >
      <Badge />
      <Logo />
    </Wrapper>
  )
}

export default Button
