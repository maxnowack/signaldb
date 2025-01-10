import React, { useMemo, useState } from 'react'
import type { Collection } from '@signaldb/core'
import styled from 'styled-components'
import UnstyledCollectionList from '../components/CollectionList'
import Table from '../components/Table'
import dataStore from '../models/dataStore'
import useCollectionMutations from '../utils/useCollectionMutations'
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

const Mutations: React.FC = () => {
  const [collectionName, setCollectionName] = useState<string>()
  const collectionsItem = dataStore.useItem('collections')
  const collection = useMemo(
    () => collectionsItem?.items.find(c => c.name === collectionName) as Collection<any>,
    [collectionsItem, collectionName],
  )
  const items = useCollectionMutations(collectionName || '')
  const mutations = useMemo(() => items.map(item => ({
    id: item.id,
    time: item.time.toLocaleString(),
    type: item.type,
    selector: JSON.stringify(item.selector, null, 2),
    modifier: JSON.stringify(item.modifier, null, 2),
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
            items={mutations}
            columns={[{
              name: 'time',
              label: 'Time',
            }, {
              name: 'type',
              label: 'Type',
            }, {
              name: 'selector',
              label: 'Selector',
            }, {
              name: 'modifier',
              label: 'Modifier',
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

export default Mutations
