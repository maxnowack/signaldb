import React, { useEffect, useState } from 'react'
import Button from './Button'
import Modal from './Modal'

/**
 * DevTools component that renders a button and a modal.
 * @returns The rendered component.
 */
const DevTools: React.FC = () => {
  const [visible, setVisible] = useState(false)

  // register global event listener to toggle visibility (CMD+Shift+S on macOS and Ctrl+Shift+S on Windows)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 's') {
        setVisible(!visible)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [visible])

  return (
    <>
      <Button onClick={() => setVisible(!visible)} />
      <Modal visible={visible} onClose={() => setVisible(false)} />
    </>
  )
}

export default DevTools
