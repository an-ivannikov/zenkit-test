# zenkit-test
https://gist.github.com/deje1011/5ac138669be96c687a0d92d543187197

## Some server side code
**Questions:**
  - What do you think PFC.props is doing?
    - **A:** PFC.props описывает и выполняет задачи, включая их зависимости от других задач.
  - What is the concurrency variable good for?
What happens if we set it to 1?
    - **A:** This variable indicates the number of `organizationIds` processed in parallel.
Immediately in parallel, 50 functions are launched, each of which works on the next `organizationId`.
If we set it to 1 then execution will occur through a call to a single instance of the processing function.
  - sendOutStatusEmails ignores errors (except for logging them).
Let's say your task was to make sure updateExceededDays fails as soon sending out any email fails.
How would you adjust the code?
    - **A:** I just need to throw that error that we caught earlier in `catch`.
`throw new Error(err);`

## Some client side code
**Questions:**
  - Do you think synchronizing the different resources could be done in parallel? 
If so, how would you do it and would there be a downside?
    - **A:** 
  - Why use _.get(err, ['data', 'error', 'code']) if you could simply do err.data.error.code?
And can you think of a better name for err here?
    - **A:** A simple method of getting the value (`err.data.error.code`) will result in a fails and does not allow to predefine the default. We must first check the existence of the `err.data` and `err.data.error` objects.
  - When you call syncList({ listId: 1 }).then(console.log), what will be logged?
    - **A:** I did not work long with Angular.JS, but from the logic implemented in the code, I can say the following:
      1. If a success completion, we will get `undefined`;
      2. If an error occurs that is in the list of `errorCodesOnWhichToRemoveSynchronization`, we get `undefined`;
      3. In all other cases, an error will be thrown containing the error object 
that should be intercepted in `syncList({ listId: 1 }).then(console.log).catch(console.error)`
otherwise the operation will be stopped by an error.

**Challenge:**
Imagine we added the created_at and updated_at columns for "categorySortOrders" as the TODO suggests.
Please adjust the code in a way that prevents synchronizing this resource if there was no change.
