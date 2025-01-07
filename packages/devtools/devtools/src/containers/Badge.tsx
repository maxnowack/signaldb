import React, { useMemo } from 'react'
import styled from 'styled-components'
import dataStore from '../models/dataStore'
import settingsStore from '../models/settingsStore'
import colors from '../colorPalette'

const Wrapper = styled.div`
  position: absolute;
  top: -6px;
  left: calc(48px - (6px + (16px / 2)));
  background-color: ${colors.primary};
  color: white;
  border-radius: 8px;
  min-width: 16px;
  height: 16px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 10px;
  font-weight: 500;
  padding: 0 4px;
  margin: 0;
  line-height: 1;
  box-shadow: 0 0 0 2px white;
`

const Badge: React.FC = () => {
  const { badgeType } = settingsStore.use()
  const collectionCount = dataStore.useItem('collections')?.items.length
  const queryCount = dataStore.useItem('queries')?.items.length
  const count = useMemo(() => {
    if (badgeType === 'collections') return collectionCount
    if (badgeType === 'queries') return queryCount
  }, [badgeType, queryCount, collectionCount])
  if (badgeType === 'disabled' || count === undefined) return null
  const title = useMemo(() => {
    if (badgeType === 'collections') return `${count} collections`
    if (badgeType === 'queries') return `${count} queries`
  }, [badgeType, count])
  return (
    <Wrapper title={title}>{count}</Wrapper>
  )
}

export default Badge
