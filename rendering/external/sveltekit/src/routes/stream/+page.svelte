<script>
  import Hero from '#lib/Hero.svelte';
  import FallbackPanel from '#lib/FallbackPanel.svelte';
  import ReadyPanel from '#lib/ReadyPanel.svelte';
  let { data } = $props();
</script>
<main class="marketplace-pdp" data-benchmark-shell="suspense-load"><Hero /><div class="content-grid">{#each data.panels as panel (panel.key)}{#await panel.promise}<FallbackPanel {panel} />{:then resolved}<ReadyPanel panel={resolved} />{/await}{/each}</div></main>
