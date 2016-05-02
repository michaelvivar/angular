import { TreeNode, UrlSegment, rootNode, UrlTree } from './segments';
import { isBlank, isPresent, isString, isStringMap } from 'angular2/src/facade/lang';
import { ListWrapper } from 'angular2/src/facade/collection';
export function link(segment, routeTree, urlTree, change) {
    if (change.length === 0)
        return urlTree;
    let startingNode;
    let normalizedChange;
    if (isString(change[0]) && change[0].startsWith("./")) {
        normalizedChange = ["/", change[0].substring(2)].concat(change.slice(1));
        startingNode = _findStartingNode(_findUrlSegment(segment, routeTree), rootNode(urlTree));
    }
    else if (isString(change[0]) && change.length === 1 && change[0] == "/") {
        normalizedChange = change;
        startingNode = rootNode(urlTree);
    }
    else if (isString(change[0]) && !change[0].startsWith("/")) {
        normalizedChange = ["/"].concat(change);
        startingNode = _findStartingNode(_findUrlSegment(segment, routeTree), rootNode(urlTree));
    }
    else {
        normalizedChange = ["/"].concat(change);
        startingNode = rootNode(urlTree);
    }
    let updated = _update(startingNode, normalizedChange);
    let newRoot = _constructNewTree(rootNode(urlTree), startingNode, updated);
    return new UrlTree(newRoot);
}
function _findUrlSegment(segment, routeTree) {
    let s = segment;
    let res = null;
    while (isBlank(res)) {
        res = ListWrapper.last(s.urlSegments);
        s = routeTree.parent(s);
    }
    return res;
}
function _findStartingNode(segment, node) {
    if (node.value === segment)
        return node;
    for (var c of node.children) {
        let r = _findStartingNode(segment, c);
        if (isPresent(r))
            return r;
    }
    return null;
}
function _constructNewTree(node, original, updated) {
    if (node === original) {
        return new TreeNode(node.value, updated.children);
    }
    else {
        return new TreeNode(node.value, node.children.map(c => _constructNewTree(c, original, updated)));
    }
}
function _update(node, changes) {
    let rest = changes.slice(1);
    let outlet = _outlet(changes);
    let segment = _segment(changes);
    if (isString(segment) && segment[0] == "/")
        segment = segment.substring(1);
    // reach the end of the tree => create new tree nodes.
    if (isBlank(node)) {
        let urlSegment = new UrlSegment(segment, null, outlet);
        let children = rest.length === 0 ? [] : [_update(null, rest)];
        return new TreeNode(urlSegment, children);
    }
    else if (outlet != node.value.outlet) {
        return node;
    }
    else {
        let urlSegment = isStringMap(segment) ? new UrlSegment(null, segment, null) :
            new UrlSegment(segment, null, outlet);
        if (rest.length === 0) {
            return new TreeNode(urlSegment, []);
        }
        return new TreeNode(urlSegment, _updateMany(ListWrapper.clone(node.children), rest));
    }
}
function _updateMany(nodes, changes) {
    let outlet = _outlet(changes);
    let nodesInRightOutlet = nodes.filter(c => c.value.outlet == outlet);
    if (nodesInRightOutlet.length > 0) {
        let nodeRightOutlet = nodesInRightOutlet[0]; // there can be only one
        nodes[nodes.indexOf(nodeRightOutlet)] = _update(nodeRightOutlet, changes);
    }
    else {
        nodes.push(_update(null, changes));
    }
    return nodes;
}
function _segment(changes) {
    if (!isString(changes[0]))
        return changes[0];
    let parts = changes[0].toString().split(":");
    return parts.length > 1 ? parts[1] : changes[0];
}
function _outlet(changes) {
    if (!isString(changes[0]))
        return null;
    let parts = changes[0].toString().split(":");
    return parts.length > 1 ? parts[0] : null;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGluay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImRpZmZpbmdfcGx1Z2luX3dyYXBwZXItb3V0cHV0X3BhdGgtYVJYU3o0RlQudG1wL2FuZ3VsYXIyL3NyYy9hbHRfcm91dGVyL2xpbmsudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ik9BQU8sRUFBTyxRQUFRLEVBQUUsVUFBVSxFQUFnQixRQUFRLEVBQUUsT0FBTyxFQUFZLE1BQU0sWUFBWTtPQUMxRixFQUFDLE9BQU8sRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLFdBQVcsRUFBQyxNQUFNLDBCQUEwQjtPQUMzRSxFQUFDLFdBQVcsRUFBQyxNQUFNLGdDQUFnQztBQUUxRCxxQkFBcUIsT0FBcUIsRUFBRSxTQUFvQixFQUFFLE9BQWdCLEVBQzdELE1BQWE7SUFDaEMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUM7UUFBQyxNQUFNLENBQUMsT0FBTyxDQUFDO0lBRXhDLElBQUksWUFBWSxDQUFDO0lBQ2pCLElBQUksZ0JBQWdCLENBQUM7SUFFckIsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3RELGdCQUFnQixHQUFHLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pFLFlBQVksR0FBRyxpQkFBaUIsQ0FBQyxlQUFlLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO0lBRTNGLENBQUM7SUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0s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TSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM3QyxJQUFJLEtBQUssR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzdDLE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxHQUFHLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2xELENBQUM7QUFFRCxpQkFBaUIsT0FBYztJQUM3QixFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDdkMsSUFBSSxLQUFLLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUM3QyxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQztBQUM1QyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtUcmVlLCBUcmVlTm9kZSwgVXJsU2VnbWVudCwgUm91dGVTZWdtZW50LCByb290Tm9kZSwgVXJsVHJlZSwgUm91dGVUcmVlfSBmcm9tICcuL3NlZ21lbnRzJztcbmltcG9ydCB7aXNCbGFuaywgaXNQcmVzZW50LCBpc1N0cmluZywgaXNTdHJpbmdNYXB9IGZyb20gJ2FuZ3VsYXIyL3NyYy9mYWNhZGUvbGFuZyc7XG5pbXBvcnQge0xpc3RXcmFwcGVyfSBmcm9tICdhbmd1bGFyMi9zcmMvZmFjYWRlL2NvbGxlY3Rpb24nO1xuXG5leHBvcnQgZnVuY3Rpb24gbGluayhzZWdtZW50OiBSb3V0ZVNlZ21lbnQsIHJvdXRlVHJlZTogUm91dGVUcmVlLCB1cmxUcmVlOiBVcmxUcmVlLFxuICAgICAgICAgICAgICAgICAgICAgY2hhbmdlOiBhbnlbXSk6IFVybFRyZWUge1xuICBpZiAoY2hhbmdlLmxlbmd0aCA9PT0gMCkgcmV0dXJuIHVybFRyZWU7XG5cbiAgbGV0IHN0YXJ0aW5nTm9kZTtcbiAgbGV0IG5vcm1hbGl6ZWRDaGFuZ2U7XG5cbiAgaWYgKGlzU3RyaW5nKGNoYW5nZVswXSkgJiYgY2hhbmdlWzBdLnN0YXJ0c1dpdGgoXCIuL1wiKSkge1xuICAgIG5vcm1hbGl6ZWRDaGFuZ2UgPSBbXCIvXCIsIGNoYW5nZVswXS5zdWJzdHJpbmcoMildLmNvbmNhdChjaGFuZ2Uuc2xpY2UoMSkpO1xuICAgIHN0YXJ0aW5nTm9kZSA9IF9maW5kU3RhcnRpbmdOb2RlKF9maW5kVXJsU2VnbWVudChzZWdtZW50LCByb3V0ZVRyZWUpLCByb290Tm9kZSh1cmxUcmVlKSk7XG5cbiAgfSBlbHNlIGlmIChpc1N0cmluZyhjaGFuZ2VbMF0pICYmIGNoYW5nZS5sZW5ndGggPT09IDEgJiYgY2hhbmdlWzBdID09IFwiL1wiKSB7XG4gICAgbm9ybWFsaXplZENoYW5nZSA9IGNoYW5nZTtcbiAgICBzdGFydGluZ05vZGUgPSByb290Tm9kZSh1cmxUcmVlKTtcblxuICB9IGVsc2UgaWYgKGlzU3RyaW5nKGNoYW5nZVswXSkgJiYgIWNoYW5nZVswXS5zdGFydHNXaXRoKFwiL1wiKSkge1xuICAgIG5vcm1hbGl6ZWRDaGFuZ2UgPSBbXCIvXCJdLmNvbmNhdChjaGFuZ2UpO1xuICAgIHN0YXJ0aW5nTm9kZSA9IF9maW5kU3RhcnRpbmdOb2RlKF9maW5kVXJsU2VnbWVudChzZWdtZW50LCByb3V0ZVRyZWUpLCByb290Tm9kZSh1cmxUcmVlKSk7XG5cbiAgfSBlbHNlIHtcbiAgICBub3JtYWxpemVkQ2hhbmdlID0gW1wiL1wiXS5jb25jYXQoY2hhbmdlKTtcbiAgICBzdGFydGluZ05vZGUgPSByb290Tm9kZSh1cmxUcmVlKTtcbiAgfVxuXG4gIGxldCB1cGRhdGVkID0gX3VwZGF0ZShzdGFydGluZ05vZGUsIG5vcm1hbGl6ZWRDaGFuZ2UpO1xuICBsZXQgbmV3Um9vdCA9IF9jb25zdHJ1Y3ROZXdUcmVlKHJvb3ROb2RlKHVybFRyZWUpLCBzdGFydGluZ05vZGUsIHVwZGF0ZWQpO1xuXG4gIHJldHVybiBuZXcgVXJsVHJlZShuZXdSb290KTtcbn1cblxuZnVuY3Rpb24gX2ZpbmRVcmxTZWdtZW50KHNlZ21lbnQ6IFJvdXRlU2VnbWVudCwgcm91dGVUcmVlOiBSb3V0ZVRyZWUpOiBVcmxTZWdtZW50IHtcbiAgbGV0IHMgPSBzZWdtZW50O1xuICBsZXQgcmVzID0gbnVsbDtcbiAgd2hpbGUgKGlzQmxhbmsocmVzKSkge1xuICAgIHJlcyA9IExpc3RXcmFwcGVyLmxhc3Qocy51cmxTZWdtZW50cyk7XG4gICAgcyA9IHJvdXRlVHJlZS5wYXJlbnQocyk7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn1cblxuZnVuY3Rpb24gX2ZpbmRTdGFydGluZ05vZGUoc2VnbWVudDogVXJsU2VnbWVudCwgbm9kZTogVHJlZU5vZGU8VXJsU2VnbWVudD4pOiBUcmVlTm9kZTxVcmxTZWdtZW50PiB7XG4gIGlmIChub2RlLnZhbHVlID09PSBzZWdtZW50KSByZXR1cm4gbm9kZTtcbiAgZm9yICh2YXIgYyBvZiBub2RlLmNoaWxkcmVuKSB7XG4gICAgbGV0IHIgPSBfZmluZFN0YXJ0aW5nTm9kZShzZWdtZW50LCBjKTtcbiAgICBpZiAoaXNQcmVzZW50KHIpKSByZXR1cm4gcjtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gX2NvbnN0cnVjdE5ld1RyZWUobm9kZTogVHJlZU5vZGU8VXJsU2VnbWVudD4sIG9yaWdpbmFsOiBUcmVlTm9kZTxVcmxTZWdtZW50PixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHVwZGF0ZWQ6IFRyZWVOb2RlPFVybFNlZ21lbnQ+KTogVHJlZU5vZGU8VXJsU2VnbWVudD4ge1xuICBpZiAobm9kZSA9PT0gb3JpZ2luYWwpIHtcbiAgICByZXR1cm4gbmV3IFRyZWVOb2RlPFVybFNlZ21lbnQ+KG5vZGUudmFsdWUsIHVwZGF0ZWQuY2hpbGRyZW4pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBuZXcgVHJlZU5vZGU8VXJsU2VnbWVudD4oXG4gICAgICAgIG5vZGUudmFsdWUsIG5vZGUuY2hpbGRyZW4ubWFwKGMgPT4gX2NvbnN0cnVjdE5ld1RyZWUoYywgb3JpZ2luYWwsIHVwZGF0ZWQpKSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gX3VwZGF0ZShub2RlOiBUcmVlTm9kZTxVcmxTZWdtZW50PiwgY2hhbmdlczogYW55W10pOiBUcmVlTm9kZTxVcmxTZWdtZW50PiB7XG4gIGxldCByZXN0ID0gY2hhbmdlcy5zbGljZSgxKTtcbiAgbGV0IG91dGxldCA9IF9vdXRsZXQoY2hhbmdlcyk7XG4gIGxldCBzZWdtZW50ID0gX3NlZ21lbnQoY2hhbmdlcyk7XG4gIGlmIChpc1N0cmluZyhzZWdtZW50KSAmJiBzZWdtZW50WzBdID09IFwiL1wiKSBzZWdtZW50ID0gc2VnbWVudC5zdWJzdHJpbmcoMSk7XG5cbiAgLy8gcmVhY2ggdGhlIGVuZCBvZiB0aGUgdHJlZSA9PiBjcmVhdGUgbmV3IHRyZWUgbm9kZXMuXG4gIGlmIChpc0JsYW5rKG5vZGUpKSB7XG4gICAgbGV0IHVybFNlZ21lbnQgPSBuZXcgVXJsU2VnbWVudChzZWdtZW50LCBudWxsLCBvdXRsZXQpO1xuICAgIGxldCBjaGlsZHJlbiA9IHJlc3QubGVuZ3RoID09PSAwID8gW10gOiBbX3VwZGF0ZShudWxsLCByZXN0KV07XG4gICAgcmV0dXJuIG5ldyBUcmVlTm9kZTxVcmxTZWdtZW50Pih1cmxTZWdtZW50LCBjaGlsZHJlbik7XG5cbiAgICAvLyBkaWZmZXJlbnQgb3V0bGV0ID0+IHByZXNlcnZlIHRoZSBzdWJ0cmVlXG4gIH0gZWxzZSBpZiAob3V0bGV0ICE9IG5vZGUudmFsdWUub3V0bGV0KSB7XG4gICAgcmV0dXJuIG5vZGU7XG5cbiAgICAvLyBzYW1lIG91dGxldCA9PiBtb2RpZnkgdGhlIHN1YnRyZWVcbiAgfSBlbHNlIHtcbiAgICBsZXQgdXJsU2VnbWVudCA9IGlzU3RyaW5nTWFwKHNlZ21lbnQpID8gbmV3IFVybFNlZ21lbnQobnVsbCwgc2VnbWVudCwgbnVsbCkgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXcgVXJsU2VnbWVudChzZWdtZW50LCBudWxsLCBvdXRsZXQpO1xuICAgIGlmIChyZXN0Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIG5ldyBUcmVlTm9kZTxVcmxTZWdtZW50Pih1cmxTZWdtZW50LCBbXSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG5ldyBUcmVlTm9kZTxVcmxTZWdtZW50Pih1cmxTZWdtZW50LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgX3VwZGF0ZU1hbnkoTGlzdFdyYXBwZXIuY2xvbmUobm9kZS5jaGlsZHJlbiksIHJlc3QpKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBfdXBkYXRlTWFueShub2RlczogVHJlZU5vZGU8VXJsU2VnbWVudD5bXSwgY2hhbmdlczogYW55W10pOiBUcmVlTm9kZTxVcmxTZWdtZW50PltdIHtcbiAgbGV0IG91dGxldCA9IF9vdXRsZXQoY2hhbmdlcyk7XG4gIGxldCBub2Rlc0luUmlnaHRPdXRsZXQgPSBub2Rlcy5maWx0ZXIoYyA9PiBjLnZhbHVlLm91dGxldCA9PSBvdXRsZXQpO1xuICBpZiAobm9kZXNJblJpZ2h0T3V0bGV0Lmxlbmd0aCA+IDApIHtcbiAgICBsZXQgbm9kZVJpZ2h0T3V0bGV0ID0gbm9kZXNJblJpZ2h0T3V0bGV0WzBdOyAgLy8gdGhlcmUgY2FuIGJlIG9ubHkgb25lXG4gICAgbm9kZXNbbm9kZXMuaW5kZXhPZihub2RlUmlnaHRPdXRsZXQpXSA9IF91cGRhdGUobm9kZVJpZ2h0T3V0bGV0LCBjaGFuZ2VzKTtcbiAgfSBlbHNlIHtcbiAgICBub2Rlcy5wdXNoKF91cGRhdGUobnVsbCwgY2hhbmdlcykpO1xuICB9XG5cbiAgcmV0dXJuIG5vZGVzO1xufVxuXG5mdW5jdGlvbiBfc2VnbWVudChjaGFuZ2VzOiBhbnlbXSk6IGFueSB7XG4gIGlmICghaXNTdHJpbmcoY2hhbmdlc1swXSkpIHJldHVybiBjaGFuZ2VzWzBdO1xuICBsZXQgcGFydHMgPSBjaGFuZ2VzWzBdLnRvU3RyaW5nKCkuc3BsaXQoXCI6XCIpO1xuICByZXR1cm4gcGFydHMubGVuZ3RoID4gMSA/IHBhcnRzWzFdIDogY2hhbmdlc1swXTtcbn1cblxuZnVuY3Rpb24gX291dGxldChjaGFuZ2VzOiBhbnlbXSk6IHN0cmluZyB7XG4gIGlmICghaXNTdHJpbmcoY2hhbmdlc1swXSkpIHJldHVybiBudWxsO1xuICBsZXQgcGFydHMgPSBjaGFuZ2VzWzBdLnRvU3RyaW5nKCkuc3BsaXQoXCI6XCIpO1xuICByZXR1cm4gcGFydHMubGVuZ3RoID4gMSA/IHBhcnRzWzBdIDogbnVsbDtcbn1cbiJdfQ==