import React, { useMemo } from 'react'
import type { Collection } from '@signaldb/core'
import dataStore from '../models/dataStore'
import List from './List'

interface Props {
  value?: string,
  onChange: (value: string) => void,
  className?: string,
}

/**
 * CollectionList component that renders a list of collections.
 * @param props - The component props.
 * @param props.className - The component class name.
 * @param props.value - The selected collection.
 * @param props.onChange - The function to call when the collection changes.
 * @returns The rendered collection list component.
 */
const CollectionList: React.FC<Props> = ({
  value,
  onChange,
  className,
}) => {
  const collectionsItem = dataStore.useItem('collections')
  const collections = useMemo(() => ((collectionsItem?.items || []) as Collection<any>[])
    .sort((a, b) => {
      if (a.name < b.name) return -1
      if (a.name > b.name) return 1
      return 0
    }), [collectionsItem])

  return (
    <List
      className={className}
      active={value}
      items={collections.map(collection => ({
        id: collection.name,
        title: collection.name,
        onClick: () => onChange(collection.name),
      }))}
    />
  )
}

export default CollectionList
