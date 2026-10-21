<script>
  import Table from '#canonical/suite_table.svelte';
  import { inputs } from '#lib/fixtures.js';
</script>
<svelte:head><title>Customer Data Table</title><meta name="viewport" content="width=device-width, initial-scale=1" /></svelte:head>
<Table {...inputs.table} />
