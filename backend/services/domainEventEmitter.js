/**
 * domainEventEmitter.js
 * Émetteur central pour les événements métier (Product & Order)
 */

import { EventEmitter } from 'events';

const domainEmitter = new EventEmitter();

// Augmenter le nombre d'écouteurs si tu as beaucoup d'événements
domainEmitter.setMaxListeners(100);

export default domainEmitter;
