<template>
  <div class="sync-example">
    <div class="sync-example__intro">
      <h2 class="sync-example__title">Local-first Sync, Visualized</h2>
      <p class="sync-example__desc">
        Two clients keep a shared list in sync automatically. Toggle offline to pause
        push/pull, create edits on either side, and watch field-level conflicts resolve
        while the server view updates below.
      </p>
    </div>
    <div class="sync-example__grid">
      <SyncClientPane
        class="sync-example__pane"
        :client="clientA"
        :last-push="server.lastPush.A"
        :last-pull="server.lastPull.A"
        @add="actions.addTodo('A')"
        @toggle="actions.toggleComplete('A', $event)"
        @start-edit="actions.startEdit('A', $event)"
        @finish-edit="actions.finishEdit('A', $event)"
        @drag-start="actions.onDragStart('A', $event)"
        @drop="actions.onDrop('A', $event)"
        @drop-end="actions.onDropEnd('A')"
      />
      <SyncClientPane
        class="sync-example__pane"
        :client="clientB"
        :last-push="server.lastPush.B"
        :last-pull="server.lastPull.B"
        @add="actions.addTodo('B')"
        @toggle="actions.toggleComplete('B', $event)"
        @start-edit="actions.startEdit('B', $event)"
        @finish-edit="actions.finishEdit('B', $event)"
        @drag-start="actions.onDragStart('B', $event)"
        @drop="actions.onDrop('B', $event)"
        @drop-end="actions.onDropEnd('B')"
      />
    </div>
    <div class="sync-example__server">
      <SyncServerPane :server="server" />
    </div>
  </div>
</template>

<script setup lang="ts">
import SyncClientPane from './sync/SyncClientPane.vue'
import SyncServerPane from './sync/SyncServerPane.vue'
import { useSyncSimulation } from './sync/useSyncSimulation'

const { clientA, clientB, server, actions } = useSyncSimulation()
</script>

<style scoped>
.sync-example {
  margin: 24px 0;
}

.sync-example__intro {
  margin-bottom: 16px;
}

.sync-example__title {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.sync-example__desc {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 14px;
  max-width: 680px;
}

.sync-example__grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(260px, 1fr));
}

.sync-example__pane {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 16px;
  box-shadow: var(--vp-shadow-1);
}

.sync-example__pane :deep(.custom-block) {
  margin: 0;
  border: none;
  background: transparent;
  padding: 0;
}

.sync-example :deep(.custom-block-title) {
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
  margin: 0;
}

.sync-example__pane :deep(ul) {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}

.sync-example__pane :deep(li) {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
}

.sync-example__pane :deep(input[type='text']) {
  width: 100%;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 6px 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.sync-example__pane :deep(.VPButton) {
  margin-left: 6px;
}

.sync-example__pane :deep(.VPBadge) {
  margin-left: 8px;
}

.sync-example__pane :deep(small) {
  color: var(--vp-c-text-2);
  font-size: 11px;
}

.sync-example__pane :deep(.custom-block.warning),
.sync-example__pane :deep(.custom-block.tip) {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 10px;
}

.sync-example__server {
  margin-top: 16px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  padding: 16px;
  box-shadow: var(--vp-shadow-1);
}

.sync-example__server :deep(.custom-block) {
  margin: 0;
  border: none;
  background: transparent;
  padding: 0;
}

@media (max-width: 960px) {
  .sync-example__grid {
    grid-template-columns: 1fr;
  }
}
</style>
