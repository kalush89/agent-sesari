/**
 * Universal Signal Schema - Core Types
 *
 * This module defines the unified "Sesari Language" format that all platform-specific
 * signals (Stripe, HubSpot, Mixpanel) are translated into.
 */
/**
 * Mapping from platform-specific events to universal types
 */
export const EVENT_TAXONOMY = {
    // Stripe mappings
    'expansion': 'revenue.expansion',
    'churn': 'revenue.churn',
    'failed_payment': 'revenue.payment_failed',
    'contraction': 'revenue.contraction',
    'payment_recovered': 'revenue.payment_recovered',
    // HubSpot mappings
    'deal_progression': 'relationship.deal_advanced',
    'deal_regression': 'relationship.deal_regressed',
    'communication_gap': 'relationship.engagement_gap',
    'sentiment_positive': 'relationship.sentiment_positive',
    'sentiment_negative': 'relationship.sentiment_negative',
    // Mixpanel mappings
    'power_user': 'behavioral.power_user',
    'feature_adoption_drop': 'behavioral.feature_adoption_drop',
    'engagement_spike': 'behavioral.engagement_spike',
    'inactivity': 'behavioral.inactivity',
};
//# sourceMappingURL=types.js.map