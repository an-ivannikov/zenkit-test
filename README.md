# zenkit-test
https://gist.github.com/deje1011/5ac138669be96c687a0d92d543187197

## Some server side code
**Questions:**
  - What do you think PFC.props is doing?
  - What is the concurrency variable good for? 
What happens if we set it to 1?
  - sendOutStatusEmails ignores errors (except for logging them).
Let's say your task was to make sure updateExceededDays fails as soon sending out any email fails.
How would you adjust the code?

## Some client side code
**Questions:**
  - Do you think synchronizing the different resources could be done in parallel? 
If so, how would you do it and would there be a downside?
  - Why use _.get(err, ['data', 'error', 'code']) if you could simply do err.data.error.code?
And can you think of a better name for err here?
  - When you call syncList({ listId: 1 }).then(console.log), what will be logged?

**Challenge:**
Imagine we added the created_at and updated_at columns for "categorySortOrders" as the TODO suggests.
Please adjust the code in a way that prevents synchronizing this resource if there was no change.
