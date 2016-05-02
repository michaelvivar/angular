import { MessageBasedPlatformLocation } from './platform_location';
import { BrowserPlatformLocation } from 'angular2/src/platform/browser/location/browser_platform_location';
import { APP_INITIALIZER, Injector, NgZone } from 'angular2/core';
export const WORKER_RENDER_ROUTER = [
    MessageBasedPlatformLocation,
    BrowserPlatformLocation,
    /* @ts2dart_Provider */ { provide: APP_INITIALIZER, useFactory: initRouterListeners, multi: true, deps: [Injector] }
];
function initRouterListeners(injector) {
    return () => {
        let zone = injector.get(NgZone);
        zone.runGuarded(() => injector.get(MessageBasedPlatformLocation).start());
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGVyX3Byb3ZpZGVycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImRpZmZpbmdfcGx1Z2luX3dyYXBwZXItb3V0cHV0X3BhdGgtYVJYU3o0RlQudG1wL2FuZ3VsYXIyL3NyYy93ZWJfd29ya2Vycy91aS9yb3V0ZXJfcHJvdmlkZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJPQUFPLEVBQUMsNEJBQTRCLEVBQUMsTUFBTSxxQkFBcUI7T0FDekQsRUFDTCx1QkFBdUIsRUFDeEIsTUFBTSxrRUFBa0U7T0FDbEUsRUFBQyxlQUFlLEVBQVksUUFBUSxFQUFFLE1BQU0sRUFBQyxNQUFNLGVBQWU7QUFFekUsT0FBTyxNQUFNLG9CQUFvQixHQUFxQjtJQUNwRCw0QkFBNEI7SUFDNUIsdUJBQXVCO0lBQ3ZCLHVCQUF1QixDQUFDLEVBQUMsT0FBTyxFQUFFLGVBQWUsRUFBRSxVQUFVLEVBQUUsbUJBQW1CLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQyxRQUFRLENBQUMsRUFBQztDQUNuSCxDQUFDO0FBRUYsNkJBQTZCLFFBQWtCO0lBQzdDLE1BQU0sQ0FBQztRQUNMLElBQUksSUFBSSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFaEMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLFFBQVEsQ0FBQyxHQUFHLENBQUMsNEJBQTRCLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBQzVFLENBQUMsQ0FBQztBQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge01lc3NhZ2VCYXNlZFBsYXRmb3JtTG9jYXRpb259IGZyb20gJy4vcGxhdGZvcm1fbG9jYXRpb24nO1xuaW1wb3J0IHtcbiAgQnJvd3NlclBsYXRmb3JtTG9jYXRpb25cbn0gZnJvbSAnYW5ndWxhcjIvc3JjL3BsYXRmb3JtL2Jyb3dzZXIvbG9jYXRpb24vYnJvd3Nlcl9wbGF0Zm9ybV9sb2NhdGlvbic7XG5pbXBvcnQge0FQUF9JTklUSUFMSVpFUiwgUHJvdmlkZXIsIEluamVjdG9yLCBOZ1pvbmV9IGZyb20gJ2FuZ3VsYXIyL2NvcmUnO1xuXG5leHBvcnQgY29uc3QgV09SS0VSX1JFTkRFUl9ST1VURVIgPSAvKkB0czJkYXJ0X2NvbnN0Ki9bXG4gIE1lc3NhZ2VCYXNlZFBsYXRmb3JtTG9jYXRpb24sXG4gIEJyb3dzZXJQbGF0Zm9ybUxvY2F0aW9uLFxuICAvKiBAdHMyZGFydF9Qcm92aWRlciAqLyB7cHJvdmlkZTogQVBQX0lOSVRJQUxJWkVSLCB1c2VGYWN0b3J5OiBpbml0Um91dGVyTGlzdGVuZXJzLCBtdWx0aTogdHJ1ZSwgZGVwczogW0luamVjdG9yXX1cbl07XG5cbmZ1bmN0aW9uIGluaXRSb3V0ZXJMaXN0ZW5lcnMoaW5qZWN0b3I6IEluamVjdG9yKTogKCkgPT4gdm9pZCB7XG4gIHJldHVybiAoKSA9PiB7XG4gICAgbGV0IHpvbmUgPSBpbmplY3Rvci5nZXQoTmdab25lKTtcblxuICAgIHpvbmUucnVuR3VhcmRlZCgoKSA9PiBpbmplY3Rvci5nZXQoTWVzc2FnZUJhc2VkUGxhdGZvcm1Mb2NhdGlvbikuc3RhcnQoKSk7XG4gIH07XG59XG4iXX0=