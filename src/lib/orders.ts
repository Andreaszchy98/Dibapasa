import { OrderItem } from '../types';

export interface OrderPricingSummary {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
}

/**
 * Calculates accurate subtotal, delivery fee, and net total for an order.
 */
export function calculateOrderPricing(
  items: OrderItem[],
  deliveryFee: number = 0,
  discount: number = 0
): OrderPricingSummary {
  const subtotal = items.reduce((acc, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    // If weighed by preparer/loader and unit is Kg/Approx
    const effectiveQty = (item.loaderWeight !== undefined && item.loaderWeight > 0)
      ? item.loaderWeight
      : (item.preparerWeight !== undefined && item.preparerWeight > 0)
        ? item.preparerWeight
        : qty;

    return acc + (effectiveQty * price);
  }, 0);

  const cleanSubtotal = Math.round(subtotal * 100) / 100;
  const cleanDelivery = Math.max(0, Math.round(deliveryFee * 100) / 100);
  const cleanDiscount = Math.max(0, Math.round(discount * 100) / 100);
  const total = Math.max(0, Math.round((cleanSubtotal + cleanDelivery - cleanDiscount) * 100) / 100);

  return {
    subtotal: cleanSubtotal,
    deliveryFee: cleanDelivery,
    discount: cleanDiscount,
    total,
  };
}

export interface WeightVarianceResult {
  hasDiscrepancy: boolean;
  expectedWeight: number;
  actualWeight: number;
  diffPercentage: number;
  varianceGrams: number;
}

/**
 * Calculates weight variance between expected approx weight and actual scale weight from preparer/loader.
 */
export function calculateWeightDiscrepancy(
  item: OrderItem,
  toleranceThresholdPercentage: number = 10
): WeightVarianceResult {
  const expectedWeight = (item.approxWeight || item.quantity || 0);
  const actualWeight = item.loaderWeight ?? item.preparerWeight ?? expectedWeight;

  if (expectedWeight <= 0) {
    return {
      hasDiscrepancy: false,
      expectedWeight: 0,
      actualWeight,
      diffPercentage: 0,
      varianceGrams: 0,
    };
  }

  const diffPercentage = Math.abs((actualWeight - expectedWeight) / expectedWeight) * 100;
  const varianceGrams = Math.round((actualWeight - expectedWeight) * 1000);

  return {
    hasDiscrepancy: diffPercentage > toleranceThresholdPercentage,
    expectedWeight,
    actualWeight,
    diffPercentage: Math.round(diffPercentage * 100) / 100,
    varianceGrams,
  };
}
