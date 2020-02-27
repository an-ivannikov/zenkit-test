/*
    Some server side code
*/

const _ = require('lodash');
const PFC = require('promise-flow-control');
const Promise = require('bluebird');

const updateExceededDays = params => {
    const concurrency = 50;
    return Promise.resolve(params)
        .then(params => utils.validateParameters(params, {
            req: {type: ['object', 'null']}, // we allow null here because it might be called from within the trial day cron job
            parentTrx: {type: 'function'},
        }))
        .then(params => PFC.props({
            organizationIds: () => {
                return knex('organizations AS o')
                    .transacting(params.parentTrx)
                    .select(['o.id'])
                    .innerJoin('accesses AS a', 'a.organizationId', 'o.id')
                    .innerJoin('users AS u', 'u.id', 'a.userId')
                    .where('a.accessType', constants.accessTypes.ORGANIZATION)
                    .where('a.isOwner', true)
                    .whereNull('a.deprecated_at')
                    .whereNull('u.deprecated_at')
                    .whereRaw('o.exceeded_days_updated_at::date < current_date')
                    .whereNot('o.escalationLevel', constants.escalationLevels.NONE)
                    .whereNotNull('o.escalationLevel')
                    .whereNull('o.deprecated_at')
                    .then(rows => _.map(rows, 'id'));
            },
            updateExceededDays: ['organizationIds', ({organizationIds}) => {
                if (_.isEmpty(organizationIds)) {
                    return null;
                }
                return knex('organizations')
                    .transacting(params.parentTrx)
                    .update({
                        // Note: knex.increment does not play well with knex.update
                        // https://github.com/tgriesser/knex/issues/269
                        exceededDays: knex.raw('"exceededDays" + 1'),
                        exceeded_days_updated_at: 'now',
                        updated_at: 'now',
                    })
                    .whereIn('id', organizationIds)
                    .return(null);
            }],
            updatedOrganizations: ['organizationIds', 'updateExceededDays', ({organizationIds}) => {
                // We use the trial days to determine the escalation level
                return Promise.map(organizationIds, organizationId => OrganizationController.updateCachedFieldsOfOrganization({
                    req: params.req,
                    parentTrx: params.parentTrx,
                    organizationId,
                    skipDataAggregation: true
                }), {concurrency});
            }],
            sendOutStatusEmails: ['updatedOrganizations', ({updatedOrganizations}) => {
                return Promise.map(updatedOrganizations, organization => {
                    // Inform the user at the start and end of the trial phase
                    if (organization.exceededDays === 1 ||
                        organization.exceededDays === constants.maxExceededDays + 1) {
                        return OrganizationController
                            .sendOutOrganizationStatusEmail({
                                req: params.req,
                                parentTrx: params.parentTrx,
                                organization
                            })
                            .catch(err => {
                                // We are ignoring errors here in order to at least inform the other users
                                log.error(`updateExceededDays Cronjob: Error when sending out organization status email. OrganizationId: ${organization.id} Error message: ${err.message}`);
                            });
                    }
                }, {concurrency});
            }]
        }))
        .return(null);
};

/*
    Questions:
    * What do you think PFC.props is doing?
    * What is the concurrency variable good for?
      What happens if we set it to 1?
    * sendOutStatusEmails ignores errors (except for logging them).
      Let's say your task was to make sure updateExceededDays fails as soon sending out any email fails.
      How would you adjust the code?
*/



/*
    Some client side code
*/
var syncList = function (params) {

    params = utils.validateParameters(params, {
        listId: {type: 'number'},
        publishFilter: {type: ['function', 'undefined']}
    });

    var listId = params.listId;
    var synchronization = inMemoryDb.getListSynchronization({listId: params.listId});

    if (_.isNil(synchronization)) {
        return $q.resolve();
    }

    syncStatusHandler.onListSyncStarted(listId);

    return RestangularWithoutLoadingBar
        .one('lists', listId)
        .all('updated-at')
        .customGET()
        .then(function (timestamps) {
            // Note: 
            // timestamps[key] === undefined means that the server did not send a value
            // timestamps[key] === null means that there are no resources of this type yet ==> no need to sync
            return $q.resolve()
                .then(function () {
                    var shouldSyncEntries = timestamps.listEntries === undefined ||
                        _.isNil(synchronization.nextWatermark) ||
                        moment(timestamps.listEntries).isAfter(moment(synchronization.nextWatermark.updated_at));
                    if (shouldSyncEntries === false || timestamps.listEntries === null) {
                        return;
                    }
                    return synchronizeEntries(listId, synchronization, params.publishFilter);
                })
                .then(function () {
                    var shouldSyncElements = timestamps.listElements === undefined ||
                        _.isNil(_.get(synchronization, ['nextElementWatermark', 'updated_at'])) ||
                        moment(timestamps.listElements).isAfter(moment(synchronization.nextElementWatermark.updated_at));
                    if (shouldSyncElements === false || timestamps.listElements === null) {
                        return;
                    }
                    return synchronizeElements(listId);
                })
                .then(function () {
                    // TODO: Add created_at, updated_at columns for category sort orders 
                    return synchronizeCategorySortOrders(listId);
                })
                .then(function () {
                    var shouldSyncViews = timestamps.views === undefined ||
                        _.isNil(_.get(synchronization, ['nextViewWatermark', 'updated_at'])) ||
                        moment(timestamps.views).isAfter(moment(synchronization.nextViewWatermark.updated_at));
                    if (shouldSyncViews === false || timestamps.views === null) {
                        return;
                    }
                    return synchronizeViews(listId);
                })
                .then(function () {
                    var shouldSyncComments = timestamps.comments === undefined ||
                        _.isNil(_.get(synchronization, ['nextCommentWatermark', 'updated_at'])) ||
                        moment(timestamps.comments).isAfter(moment(synchronization.nextCommentWatermark.updated_at));
                    if (shouldSyncComments === false || timestamps.comments === null) {
                        return;
                    }
                    return synchronizeComments(listId);
                })
                .then(function () {
                    return markListSynchronizationAsDone(listId);
                });
        })
        .catch(function (err) {
            var errorCodesOnWhichToRemoveSynchronization = [
                ZenkitErrorCodes.NOT_FOUND.code,
                ZenkitErrorCodes.LIST_IS_DEPRECATED.code
            ];
            if (_.includes(errorCodesOnWhichToRemoveSynchronization, _.get(err, ['data', 'error', 'code']))) {
                return $q.all([
                    inMemoryDb.update(resources.LIST, {id: listId}, null),
                    inMemoryDb.update(resources.LIST_ELEMENTS, {listId: listId}, null),
                    // This will delete the other resources associated with this list:
                    SynchronizationService.deleteListSynchronization({listId: listId})
                ]);
            }
            return $q.reject(err);
        })
        .catch(function (err) {
            syncStatusHandler.onListSyncFailed(listId);
            return $q.reject(err);
        })
        .then(function () {
            syncStatusHandler.onListSyncDone(listId);
            return;
        });
};

/*
    Questions:
    * Do you think synchronizing the different resources could be done in parallel? 
      If so, how would you do it and would there be a downside?
    * Why use _.get(err, ['data', 'error', 'code']) if you could simply do err.data.error.code?
      And can you think of a better name for err here?
    * When you call syncList({ listId: 1 }).then(console.log), what will be logged?

    Challenge:
    Imagine we added the created_at and updated_at columns for "categorySortOrders" as the TODO suggests.
    Please adjust the code in a way that prevents synchronizing this resource if there was no change.
*/
