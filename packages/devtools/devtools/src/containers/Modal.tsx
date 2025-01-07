import React, { useState } from 'react'
import styled, { css } from 'styled-components'
import colors from '../colorPalette'
import settingsStore from '../models/settingsStore'
import Data from './Data'
import Settings from './Settings'
import Queries from './Queries'
import Profiler from './Profiler'
import Mutations from './Mutations'

const Background = styled.div<{ $closed: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  transition-duration: 0.3s;
  opacity: ${p => (p.$closed ? 0 : 1)};
  z-index: 100;
  pointer-events: ${p => (p.$closed ? 'none' : 'auto')};
`
const closedStyle = css`
  bottom: 20px;
  left: 45px;
  top: calc(100vh - (20px + 48px));
  right: calc(100vw - (45px + 48px));
  opacity: 0;
  pointer-events: none;
  @media (max-width: 768px) {
    right: calc(100vw - (20px + 48px));
  }
`
const Wrapper = styled.div<{ $closed: boolean }>`
  position: fixed;
  bottom: 20px;
  left: 45px;
  right: 45px;
  top: 20px;
  transition-duration: 0.3s;
  background-color: ${colors.darkGrey};
  border-radius: 8px;
  z-index: 1000;
  box-shadow: 0px 16px 24px rgba(0, 0, 0, 0.06), 0px 2px 6px rgba(0, 0, 0, 0.04), 0px 0px 1px rgba(0, 0, 0, 0.04);
  @media (max-width: 768px) {
    left: 20px;
    right: 20px;
  }

  ${p => p.$closed && closedStyle}

  display: grid;
  grid-template-areas:
    'tabs'
    'content';
  grid-template-columns: 1fr;
  grid-template-rows: auto 1fr;
`
const CloseButton = styled.button`
  position: absolute;
  top: 0;
  right: 0;
  border: 0;
  background-color: transparent;
  padding: 10px 20px;
  grid-area: close;
  color: ${colors.white};
  font-size: 28px;
  line-height: 1;
`
const TabBar = styled.nav`
  grid-area: tabs;
  border-bottom: 2px solid #555;
  display: flex;
`
const Tab = styled.button<{ $active: boolean }>`
  border: 0;
  background-color: transparent;
  border-bottom: 2px solid ${p => (p.$active ? colors.primary : 'transparent')};
  padding: 14px 0;
  margin: 0 16px -2px;
  transition-duration: 0.3s;
  color: ${p => (p.$active ? colors.white : colors.lightGrey)};
  display: flex;
  align-items: center;
  justify-content: center;
  input {
    margin-right: 6px;
  }
`
const Content = styled.div`
  grid-area: content;
  overflow: hidden;
`

/**
 * Modal component that displays data and queries tabs.
 * @param props - Component props.
 * @param props.visible - Determines if the modal is visible.
 * @param props.onClose - Function to call when the modal is closed.
 * @returns The rendered modal component.
 */
const Modal: React.FC<{ visible: boolean, onClose: () => void }> = ({ visible, onClose }) => {
  const settings = settingsStore.use()
  const [tab, setTab] = useState('data')
  let content = null
  switch (tab) {
    case 'data': {
      content = <Data />
      break
    }
    case 'queries': {
      content = <Queries />
      break
    }
    case 'settings': {
      content = <Settings />
      break
    }
    case 'mutations': {
      content = <Mutations />
      break
    }
    case 'profiler': {
      content = <Profiler />
      break
    }
  }
  return (
    <>
      <Wrapper $closed={!visible}>
        <CloseButton onClick={onClose}>×</CloseButton>
        <TabBar>
          <Tab onClick={() => setTab('data')} $active={tab === 'data'}>
            Data
          </Tab>
          <Tab onClick={() => setTab('queries')} $active={tab === 'queries'}>
            <input
              type="checkbox"
              title="Enable tracking of queries"
              checked={settings.trackQueries}
              onChange={event => settingsStore.patch({ trackQueries: event.target.checked })}
            />
            Queries
          </Tab>
          <Tab onClick={() => setTab('mutations')} $active={tab === 'mutations'}>
            <input
              type="checkbox"
              title="Enable tracking of mutations"
              checked={settings.trackMutations}
              onChange={event => settingsStore.patch({ trackMutations: event.target.checked })}
            />
            Mutations
          </Tab>
          <Tab onClick={() => setTab('profiler')} $active={tab === 'profiler'}>
            <input
              type="checkbox"
              title="Enable tracking of measurements"
              checked={settings.trackMeasurements}
              onChange={event => settingsStore.patch({ trackMeasurements: event.target.checked })}
            />
            Performance
          </Tab>
          <Tab onClick={() => setTab('settings')} $active={tab === 'settings'}>
            Settings
          </Tab>
        </TabBar>
        <Content>
          {content}
        </Content>
      </Wrapper>
      <Background
        $closed={!visible}
        onClick={onClose}
      />
    </>
  )
}

export default Modal
