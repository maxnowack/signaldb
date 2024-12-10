# @signaldb/meteor

## meteorReactivityAdapter (`default`)

```js
import meteorReactivityAdapter from '@signaldb/meteor'
import { Collection } from '@signaldb/core'

const collection = new Collection({
  reactivity: meteorReactivityAdapter,
})
```

Reactivity adapter for usage with [Meteor Tracker](https://docs.meteor.com/api/tracker.html). See see [Meteor Reactivity Adapter page](/reactivity/meteor-tracker/) for more information.
