import { buildCardSections, buildProducts, buildTableRows, STAR_PATH, STATUS_CLASSES, formatCurrency, formatDate, formatDateTime, formatPercent, formatPrice, formatRating } from '#fixtures';

// Construct data before requests, just like the other production adapters.
export const inputs = {
  cards: { sections: buildCardSections() },
  table: { rows: buildTableRows(), statusClasses: STATUS_CLASSES, formatCurrency, formatDate, formatDateTime, formatPercent },
  products: { products: buildProducts(), starIndexes: [0, 1, 2, 3, 4], starPath: STAR_PATH, formatPrice, formatRating },
};
