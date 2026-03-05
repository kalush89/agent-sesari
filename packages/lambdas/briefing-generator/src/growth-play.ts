/**
 * Growth Play Determination Module
 * 
 * Maps Universal Signals to actionable Growth Play buttons.
 * Each signal category maps to specific action types:
 * - Revenue signals → Customer detail pages
 * - Relationship signals → HubSpot external links
 * - Behavioral signals → User activity pages
 */

import type { Universal_Signal, GrowthPlay } from './types.js';

/**
 * Determine the appropriate Growth Play action for a signal
 * 
 * Maps signals to actionable buttons based on category:
 * - Revenue: Navigate to customer detail page
 * - Relationship: Open HubSpot contact/deal page
 * - Behavioral: Navigate to user activity page
 * 
 * @param signal - Universal Signal to create action for
 * @returns GrowthPlay with label, action type, and target URL
 */
export function determineGrowthPlay(signal: Universal_Signal): GrowthPlay {
  switch (signal.category) {
    case 'revenue':
      return createRevenueGrowthPlay(signal);
    
    case 'relationship':
      return createRelationshipGrowthPlay(signal);
    
    case 'behavioral':
      return createBehavioralGrowthPlay(signal);
    
    default:
      // Fallback for unknown categories
      return {
        label: 'View Details',
        action: 'navigate',
        target: '/'
      };
  }
}

/**
 * Create Growth Play for revenue signals
 * Links to customer detail page in the app
 */
function createRevenueGrowthPlay(signal: Universal_Signal): GrowthPlay {
  const customerId = signal.entity.platformIds.stripe;
  
  if (!customerId) {
    return {
      label: 'View Customer',
      action: 'navigate',
      target: '/customers'
    };
  }
  
  // Determine label based on event type
  let label = 'View Customer Details';
  
  if (signal.eventType === 'revenue.churn') {
    label = 'Review Churn Details';
  } else if (signal.eventType === 'revenue.expansion') {
    label = 'Thank Customer';
  } else if (signal.eventType === 'revenue.contraction') {
    label = 'Check on Customer';
  } else if (signal.eventType === 'revenue.payment_failed') {
    label = 'Update Payment Info';
  }
  
  return {
    label,
    action: 'navigate',
    target: `/customers/${customerId}`
  };
}

/**
 * Create Growth Play for relationship signals
 * Opens HubSpot contact or deal page in new tab
 */
function createRelationshipGrowthPlay(signal: Universal_Signal): GrowthPlay {
  const contactId = signal.entity.platformIds.hubspot;
  
  if (!contactId) {
    return {
      label: 'Open HubSpot',
      action: 'external',
      target: 'https://app.hubspot.com'
    };
  }
  
  // Determine label based on event type
  let label = 'Open in HubSpot';
  
  if (signal.eventType === 'relationship.engagement_gap') {
    label = 'Schedule Check-in';
  } else if (signal.eventType === 'relationship.sentiment_negative') {
    label = 'Address Concerns';
  } else if (signal.eventType === 'relationship.deal_advanced') {
    label = 'View Deal Progress';
  } else if (signal.eventType === 'relationship.deal_regressed') {
    label = 'Review Deal Status';
  }
  
  return {
    label,
    action: 'external',
    target: `https://app.hubspot.com/contacts/0/contact/${contactId}`
  };
}

/**
 * Create Growth Play for behavioral signals
 * Links to user activity page in the app
 */
function createBehavioralGrowthPlay(signal: Universal_Signal): GrowthPlay {
  const userId = signal.entity.platformIds.mixpanel;
  
  if (!userId) {
    return {
      label: 'View Activity',
      action: 'navigate',
      target: '/users'
    };
  }
  
  // Determine label based on event type
  let label = 'View User Activity';
  
  if (signal.eventType === 'behavioral.power_user') {
    label = 'Explore Upsell';
  } else if (signal.eventType === 'behavioral.inactivity') {
    label = 'Re-engage User';
  } else if (signal.eventType === 'behavioral.feature_adoption_drop') {
    label = 'Check Feature Usage';
  } else if (signal.eventType === 'behavioral.engagement_spike') {
    label = 'Review Engagement';
  }
  
  return {
    label,
    action: 'navigate',
    target: `/users/${userId}`
  };
}
