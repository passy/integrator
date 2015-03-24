import Immutable from 'immutable';
import _ from 'fnkit';

import { pluck, findByKey } from './immutable-kit';

const forwardPhaseNames = ['setup', 'run', 'assert'];
const reversePhaseNames = ['teardown'];

const utils = {
    /**
     * Combine the stacks from Error objects `e` and `f` to produce a stack with the message from
     * `e` but the trace from `f`. Useful if you want to rewrite an error message.
     */
    fakeStack: ((e, f) =>
        e.stack
            // Just the first line
            .split('\n').slice(0,1)
            .concat(
                // All but the first line
                f.stack.split('\n').slice(1)
            )
            .join('\n')
    ),

    rememberRanAction: action => data => data.update('ran', ran => ran.concat([action])),

    findByName: findByKey('name')
};

const Action = (name, deps, spec) =>
    Immutable.fromJS({ name, deps, spec });

const InitialData = (target, model) =>
    Immutable.Map({
        target,
        model,
        ran: Immutable.List()
    });

const wrapPhase = (action, phaseName) => data => {
    try {
        return data.update(
            'model',
            action.getIn(['spec', phaseName], _.identity)
        );
    } catch (why) {
        var e = Error(`${action.get('name')}, ${phaseName}: ${why.message}`);
        e.data = data;
        e.stack = utils.fakeStack(e, why);
        throw e;
    }
}

const attachActions = orderedPhaseNames => (pPreviousData, action) =>
    orderedPhaseNames.reduce(
        (pPrev, phaseName) => pPrev.then(wrapPhase(action, phaseName)),
        pPreviousData.then(utils.rememberRanAction(action))
    );

const walkActionsPath = (actionsPath, pInput) =>
    // 2: After the forward actions have been added, add the actions that reverse back out
    actionsPath.reverse().reduce(
        attachActions(reversePhaseNames),
        // 1: Attach the actions that play when walking forward through the tree
        actionsPath.reduce(attachActions(forwardPhaseNames), pInput)
    );

const dedupe = (arr) =>
    arr.reduce(
        (memo, v) =>
            (memo.contains(v) ?
                memo :
                memo.concat(Immutable.List(v))),
        Immutable.List()
    );

const buildActionPath = (actions, targetName) =>
    dedupe(
        utils.findByName(actions)(targetName)
            .get('deps')
            .flatMap(_.partial(buildActionPath, actions))
    ).concat([targetName]);

const Runner = (actions, model) => targetName => {
    let actionPath = buildActionPath(actions, targetName);
    console.log('actionPath', actionPath.map(utils.findByName(actions)).toJS());
    return walkActionsPath(
        actionPath.map(utils.findByName(actions)),
        Promise.resolve(InitialData(targetName, model))
    );
}

export { Runner, Action };
