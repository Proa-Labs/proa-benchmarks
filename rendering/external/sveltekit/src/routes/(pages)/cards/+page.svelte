<script>
  import Cards from '#canonical/suite_cards.svelte';
  import { inputs } from '#lib/fixtures.js';
</script>
<svelte:head><title>SSR Benchmark Page</title><meta name="viewport" content="width=device-width, initial-scale=1" /></svelte:head>
<Cards {...inputs.cards} />
