<template>
  <div class="box sync-pane">
    <p class="custom-block-title">Server</p>

    <ul class="sync-pane__list">
      <li v-for="item in server.items" :key="item.id" class="sync-pane__item">
        <input type="checkbox" :checked="item.completed" disabled />
        <div class="sync-pane__title">
          <del v-if="item.completed">{{ item.title }}</del>
          <span v-else>{{ item.title }}</span>
        </div>
        <small class="sync-pane__order">order: {{ item.order.toFixed(2) }}</small>
      </li>
    </ul>

    <div class="custom-block tip sync-pane__log">
      <p class="custom-block-title">Event log</p>
      <div v-if="server.log.length === 0" class="sync-pane__log-empty">No events yet</div>
      <ul v-else class="sync-pane__log-list">
        <li v-for="(entry, index) in server.log" :key="index">{{ entry }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Todo, ClientId } from './useSyncSimulation'

interface Props {
  server: {
    items: Todo[]
    log: string[]
    lastPush: Record<ClientId, string>
    lastPull: Record<ClientId, string>
  }
}

defineProps<Props>()
</script>

<style scoped>
.sync-pane {
  display: grid;
  grid-template-areas: 'title title' 'list log';
  grid-gap: 16px;
}
.sync-pane__list {
  grid-area: list;
  margin: 0;
  padding: 0;
  list-style: none;
  gap: 8px;
  display: flex;
  flex-direction: column;
  max-height: 300px;
  overflow: auto;
}

.sync-pane__item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
}

.sync-pane__title {
  font-size: 14px;
  color: var(--vp-c-text-1);
}

.sync-pane__order {
  color: var(--vp-c-text-2);
  font-size: 11px;
}

.sync-pane__log {
  grid-area: log;
  margin-top: 12px;
  padding: 6px 8px;
}

.sync-pane__log-list {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 2px;
  font-size: 10px;
  line-height: 1.2;
  color: var(--vp-c-text-2);
  max-height: 300px;
  overflow: auto;
}

.sync-pane__log-list li {
  padding: 0;
  margin: 0;
}

.sync-pane__log-empty {
  font-size: 10px;
  color: var(--vp-c-text-2);
  margin-top: 2px;
}

@media (max-width: 960px) {
  .sync-pane {
    grid-template-areas: 'title' 'list' 'log';
  }
}
</style>
