<script>let { panel } = $props();</script>
<section class="marketplace-panel fallback" data-panel={panel.key} data-panel-fallback={panel.key} aria-busy="true" aria-label={panel.fallbackLabel}><p class="panel-eyebrow">Fallback</p><h2>{panel.fallbackLabel}</h2><p>Waiting on upstream service.</p></section>
