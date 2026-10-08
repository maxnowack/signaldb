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
const CollectionList = ({
  value,
  onChange,
  className,
}: Props) => {
  const collectionsItem = dataStore.useItem('collections')
  const collections = useMemo(() => ((collectionsItem?.items || []) as Collection<any>[])
    // eslint-disable-next-line unicorn/prefer-simple-sort-comparator -- names are strings
    .toSorted((a, b) => {
      if (a.name < b.name) return -1
      return a.name > b.name ? 1 : 0
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
