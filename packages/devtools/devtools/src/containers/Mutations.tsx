import React, { useMemo, useState } from 'react'
import type { Collection } from '@signaldb/core'
import styled from 'styled-components'
import UnstyledCollectionList from '../components/CollectionList'
import Table from '../components/Table'
import dataStore from '../models/dataStore'
import useCollectionMutations from '../utils/useCollectionMutations'

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
  const mutations = useCollectionMutations(collectionName || '')
  return (
    <Wrapper>
      <CollectionList
        value={collectionName}
        onChange={name => setCollectionName(name)}
      />
      {collection
        ? (
          <Items
            itemColumn={`${collectionName} (${mutations.length} mutations)`}
            items={mutations}
          />
        )
        : (
          <Items
            items={[]}
            placeholder="Select a collection on the left"
          />
        )}
    </Wrapper>
  )
}

export default Mutations
