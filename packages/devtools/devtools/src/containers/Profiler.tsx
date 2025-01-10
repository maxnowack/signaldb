import React, { useMemo, useState } from 'react'
import type { Collection } from '@signaldb/core'
import styled from 'styled-components'
import UnstyledCollectionList from '../components/CollectionList'
import Table from '../components/Table'
import dataStore from '../models/dataStore'
import useCollectionMeasuredTimes from '../utils/useCollectionMeasuredTimes'
import clearCallstack from '../utils/clearCallstack'

const Wrapper = styled.div`
  display: grid;
  grid-template-areas: 'list items';
  grid-template-columns: 200px 1fr;
  overflow: hidden;
  height: 100%;
`
const CollectionList = styled(UnstyledCollectionList)`
  grid-area: list;
`
const Items = styled(Table)`
  grid-area: items;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  position: relative;
`

const Profiler: React.FC = () => {
  const [collectionName, setCollectionName] = useState<string>()
  const collectionsItem = dataStore.useItem('collections')
  const collection = useMemo(
    () => collectionsItem?.items.find(c => c.name === collectionName) as Collection<any>,
    [collectionsItem, collectionName],
  )
  const items = useCollectionMeasuredTimes(collectionName || '')
  const measuredTimes = useMemo(() => items.map(item => ({
    id: item.id,
    time: item.time.toLocaleString(),
    measuredTime: `${item.measuredTime < 1 ? '< 1' : item.measuredTime.toFixed(0)} ms`,
    selector: JSON.stringify(item.selector, null, 2),
    callstack: clearCallstack(item.callstack as string),
  })), [items])
  return (
    <Wrapper>
      <CollectionList
        value={collectionName}
        onChange={name => setCollectionName(name)}
      />
      {collection
        ? (
          <Items
            items={measuredTimes}
            columns={[{
              name: 'time',
              label: 'Time',
            }, {
              name: 'measuredTime',
              label: 'Measured Time',
            }, {
              name: 'selector',
              label: 'Selector',
            }, {
              name: 'callstack',
              label: 'Callstack',
            }]}
          />
        )
        : (
          <Items
            items={[]}
            columns={[]}
            placeholder="Select a collection on the left"
          />
        )}
    </Wrapper>
  )
}

export default Profiler
