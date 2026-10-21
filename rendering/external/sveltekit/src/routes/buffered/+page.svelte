<script>
  import Hero from '#lib/Hero.svelte';
  import ReadyPanel from '#lib/ReadyPanel.svelte';
  let { data } = $props();
</script>
<main class="marketplace-pdp" data-benchmark-shell="suspense-load"><Hero /><div class="content-grid">{#each data.panels as panel (panel.key)}<ReadyPanel {panel} />{/each}</div></main>
