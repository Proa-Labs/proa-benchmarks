<script>
  import ProductCard from './ProductCard.svelte';
  let { panel } = $props();
</script>
<section class="marketplace-panel ready" data-panel={panel.key} data-panel-ready={panel.key}><p class="panel-eyebrow">{panel.eyebrow}</p><h2>{panel.title}</h2><p>{panel.body}</p>{#if panel.products.length}<div class="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{#each panel.products as product (product.id)}<ProductCard {product} />{/each}</div>{/if}</section>
