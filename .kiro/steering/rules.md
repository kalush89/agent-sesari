---
inclusion: always
---

# Code Reliability Rules

## High Reliability Standards

All code must be written with high reliability and production-readiness in mind.

## AWS SDK Patterns

### Standard Practices

1. **Error Handling**: Always wrap AWS SDK calls in try-catch blocks with proper error logging
2. **Retries**: Use built-in SDK retry logic with exponential backoff
3. **Timeouts**: Set appropriate timeouts for all AWS service calls
4. **Credentials**: Use IAM roles and never hardcode credentials
5. **Region Configuration**: Explicitly configure AWS region in SDK clients

### Example Pattern

```typescript
/**
 * Retrieves an item from DynamoDB with proper error handling
 */
async function getItem(tableName: string, key: string): Promise<Item | null> {
  const client = new DynamoDBClient({ region: process.env.AWS_REGION });
  
  try {
    const response = await client.send(new GetItemCommand({
      TableName: tableName,
      Key: { id: { S: key } }
    }));
    
    return response.Item ? unmarshall(response.Item) : null;
  } catch (error) {
    console.error('DynamoDB GetItem failed:', error);
    throw new Error(`Failed to retrieve item: ${error.message}`);
  }
}
```

## Reliability Checklist

- [ ] All AWS SDK calls have error handling
- [ ] Sensitive data is never logged
- [ ] Environment variables are validated at startup
- [ ] Functions have single responsibility
- [ ] Edge cases are handled with early returns
- [ ] All functions have JSDoc comments
