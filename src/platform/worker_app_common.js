'use strict';"use strict";
var xhr_1 = require('angular2/src/compiler/xhr');
var xhr_impl_1 = require('angular2/src/web_workers/worker/xhr_impl');
var renderer_1 = require('angular2/src/web_workers/worker/renderer');
var lang_1 = require('angular2/src/facade/lang');
var api_1 = require('angular2/src/core/render/api');
var core_1 = require('angular2/core');
var common_1 = require("angular2/common");
var client_message_broker_1 = require('angular2/src/web_workers/shared/client_message_broker');
var service_message_broker_1 = require('angular2/src/web_workers/shared/service_message_broker');
var serializer_1 = require("angular2/src/web_workers/shared/serializer");
var api_2 = require("angular2/src/web_workers/shared/api");
var render_store_1 = require('angular2/src/web_workers/shared/render_store');
var PrintLogger = (function () {
    function PrintLogger() {
        this.log = lang_1.print;
        this.logError = lang_1.print;
        this.logGroup = lang_1.print;
    }
    PrintLogger.prototype.logGroupEnd = function () { };
    return PrintLogger;
}());
exports.WORKER_APP_PLATFORM_MARKER = 
/*@ts2dart_const*/ new core_1.OpaqueToken('WorkerAppPlatformMarker');
exports.WORKER_APP_PLATFORM = 
/*@ts2dart_const*/ [
    core_1.PLATFORM_COMMON_PROVIDERS,
    /*@ts2dart_const*/ (
    /* @ts2dart_Provider */ { provide: exports.WORKER_APP_PLATFORM_MARKER, useValue: true })
];
exports.WORKER_APP_APPLICATION_COMMON = 
/*@ts2dart_const*/ [
    core_1.APPLICATION_COMMON_PROVIDERS,
    common_1.FORM_PROVIDERS,
    serializer_1.Serializer,
    /* @ts2dart_Provider */ { provide: core_1.PLATFORM_PIPES, useValue: common_1.COMMON_PIPES, multi: true },
    /* @ts2dart_Provider */ { provide: core_1.PLATFORM_DIRECTIVES, useValue: common_1.COMMON_DIRECTIVES, multi: true },
    /* @ts2dart_Provider */ { provide: client_message_broker_1.ClientMessageBrokerFactory, useClass: client_message_broker_1.ClientMessageBrokerFactory_ },
    /* @ts2dart_Provider */ { provide: service_message_broker_1.ServiceMessageBrokerFactory, useClass: service_message_broker_1.ServiceMessageBrokerFactory_ },
    renderer_1.WebWorkerRootRenderer,
    /* @ts2dart_Provider */ { provide: api_1.RootRenderer, useExisting: renderer_1.WebWorkerRootRenderer },
    /* @ts2dart_Provider */ { provide: api_2.ON_WEB_WORKER, useValue: true },
    render_store_1.RenderStore,
    /* @ts2dart_Provider */ { provide: core_1.ExceptionHandler, useFactory: _exceptionHandler, deps: [] },
    xhr_impl_1.WebWorkerXHRImpl,
    /* @ts2dart_Provider */ { provide: xhr_1.XHR, useExisting: xhr_impl_1.WebWorkerXHRImpl }
];
function _exceptionHandler() {
    return new core_1.ExceptionHandler(new PrintLogger());
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2VyX2FwcF9jb21tb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJkaWZmaW5nX3BsdWdpbl93cmFwcGVyLW91dHB1dF9wYXRoLXpScUJGODJiLnRtcC9hbmd1bGFyMi9zcmMvcGxhdGZvcm0vd29ya2VyX2FwcF9jb21tb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLG9CQUFrQiwyQkFBMkIsQ0FBQyxDQUFBO0FBQzlDLHlCQUErQiwwQ0FBMEMsQ0FBQyxDQUFBO0FBQzFFLHlCQUFvQywwQ0FBMEMsQ0FBQyxDQUFBO0FBQy9FLHFCQUFvQiwwQkFBMEIsQ0FBQyxDQUFBO0FBQy9DLG9CQUEyQiw4QkFBOEIsQ0FBQyxDQUFBO0FBQzFELHFCQU9PLGVBQWUsQ0FBQyxDQUFBO0FBQ3ZCLHVCQUE4RCxpQkFBaUIsQ0FBQyxDQUFBO0FBQ2hGLHNDQUdPLHVEQUF1RCxDQUFDLENBQUE7QUFDL0QsdUNBR08sd0RBQXdELENBQUMsQ0FBQTtBQUNoRSwyQkFBeUIsNENBQTRDLENBQUMsQ0FBQTtBQUN0RSxvQkFBNEIscUNBQXFDLENBQUMsQ0FBQTtBQUNsRSw2QkFBMEIsOENBQThDLENBQUMsQ0FBQTtBQUV6RTtJQUFBO1FBQ0UsUUFBRyxHQUFHLFlBQUssQ0FBQztRQUNaLGFBQVEsR0FBRyxZQUFLLENBQUM7UUFDakIsYUFBUSxHQUFHLFlBQUssQ0FBQztJQUVuQixDQUFDO0lBREMsaUNBQVcsR0FBWCxjQUFlLENBQUM7SUFDbEIsa0JBQUM7QUFBRCxDQUFDLEFBTEQsSUFLQztBQUVZLGtDQUEwQjtBQUNuQyxrQkFBa0IsQ0FBQyxJQUFJLGtCQUFXLENBQUMseUJBQXlCLENBQUMsQ0FBQztBQUVyRCwyQkFBbUI7QUFDNUIsa0JBQWtCLENBQUE7SUFDaEIsZ0NBQXlCO0lBQ3pCLGtCQUFrQixDQUFDO0lBQ2YsdUJBQXVCLENBQUMsRUFBQyxPQUFPLEVBQUUsa0NBQTBCLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBQyxDQUFDO0NBQ25GLENBQUM7QUFFTyxxQ0FBNkI7QUFDdEMsa0JBQWtCLENBQUE7SUFDaEIsbUNBQTRCO0lBQzVCLHVCQUFjO0lBQ2QsdUJBQVU7SUFDVix1QkFBdUIsQ0FBQyxFQUFDLE9BQU8sRUFBRSxxQkFBYyxFQUFFLFFBQVEsRUFBRSxxQkFBWSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUM7SUFDdEYsdUJBQXVCLENBQUMsRUFBQyxPQUFPLEVBQUUsMEJBQW1CLEVBQUUsUUFBUSxFQUFFLDBCQUFpQixFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUM7SUFDaEcsdUJBQXVCLENBQUMsRUFBQyxPQUFPLEVBQUUsa0RBQTBCLEVBQUUsUUFBUSxFQUFFLG1EQUEyQixFQUFDO0lBQ3BHLHVCQUF1QixDQUFDLEVBQUMsT0FBTyxFQUFFLG9EQUEyQixFQUFFLFFBQVEsRUFBRSxxREFBNEIsRUFBQztJQUN0RyxnQ0FBcUI7SUFDckIsdUJBQXVCLENBQUMsRUFBQyxPQUFPLEVBQUUsa0JBQVksRUFBRSxXQUFXLEVBQUUsZ0NBQXFCLEVBQUM7SUFDbkYsdUJBQXVCLENBQUMsRUFBQyxPQUFPLEVBQUUsbUJBQWEsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFDO0lBQ2hFLDBCQUFXO0lBQ1gsdUJBQXVCLENBQUMsRUFBQyxPQUFPLEVBQUUsdUJBQWdCLEVBQUUsVUFBVSxFQUFFLGlCQUFpQixFQUFFLElBQUksRUFBRSxFQUFFLEVBQUM7SUFDNUYsMkJBQWdCO0lBQ2hCLHVCQUF1QixDQUFDLEVBQUMsT0FBTyxFQUFFLFNBQUcsRUFBRSxXQUFXLEVBQUUsMkJBQWdCLEVBQUM7Q0FDdEUsQ0FBQztBQUVOO0lBQ0UsTUFBTSxDQUFDLElBQUksdUJBQWdCLENBQUMsSUFBSSxXQUFXLEVBQUUsQ0FBQyxDQUFDO0FBQ2pELENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1hIUn0gZnJvbSAnYW5ndWxhcjIvc3JjL2NvbXBpbGVyL3hocic7XG5pbXBvcnQge1dlYldvcmtlclhIUkltcGx9IGZyb20gJ2FuZ3VsYXIyL3NyYy93ZWJfd29ya2Vycy93b3JrZXIveGhyX2ltcGwnO1xuaW1wb3J0IHtXZWJXb3JrZXJSb290UmVuZGVyZXJ9IGZyb20gJ2FuZ3VsYXIyL3NyYy93ZWJfd29ya2Vycy93b3JrZXIvcmVuZGVyZXInO1xuaW1wb3J0IHtwcmludH0gZnJvbSAnYW5ndWxhcjIvc3JjL2ZhY2FkZS9sYW5nJztcbmltcG9ydCB7Um9vdFJlbmRlcmVyfSBmcm9tICdhbmd1bGFyMi9zcmMvY29yZS9yZW5kZXIvYXBpJztcbmltcG9ydCB7XG4gIFBMQVRGT1JNX0RJUkVDVElWRVMsXG4gIFBMQVRGT1JNX1BJUEVTLFxuICBFeGNlcHRpb25IYW5kbGVyLFxuICBBUFBMSUNBVElPTl9DT01NT05fUFJPVklERVJTLFxuICBQTEFURk9STV9DT01NT05fUFJPVklERVJTLFxuICBPcGFxdWVUb2tlblxufSBmcm9tICdhbmd1bGFyMi9jb3JlJztcbmltcG9ydCB7Q09NTU9OX0RJUkVDVElWRVMsIENPTU1PTl9QSVBFUywgRk9STV9QUk9WSURFUlN9IGZyb20gXCJhbmd1bGFyMi9jb21tb25cIjtcbmltcG9ydCB7XG4gIENsaWVudE1lc3NhZ2VCcm9rZXJGYWN0b3J5LFxuICBDbGllbnRNZXNzYWdlQnJva2VyRmFjdG9yeV9cbn0gZnJvbSAnYW5ndWxhcjIvc3JjL3dlYl93b3JrZXJzL3NoYXJlZC9jbGllbnRfbWVzc2FnZV9icm9rZXInO1xuaW1wb3J0IHtcbiAgU2VydmljZU1lc3NhZ2VCcm9rZXJGYWN0b3J5LFxuICBTZXJ2aWNlTWVzc2FnZUJyb2tlckZhY3RvcnlfXG59IGZyb20gJ2FuZ3VsYXIyL3NyYy93ZWJfd29ya2Vycy9zaGFyZWQvc2VydmljZV9tZXNzYWdlX2Jyb2tlcic7XG5pbXBvcnQge1NlcmlhbGl6ZXJ9IGZyb20gXCJhbmd1bGFyMi9zcmMvd2ViX3dvcmtlcnMvc2hhcmVkL3NlcmlhbGl6ZXJcIjtcbmltcG9ydCB7T05fV0VCX1dPUktFUn0gZnJvbSBcImFuZ3VsYXIyL3NyYy93ZWJfd29ya2Vycy9zaGFyZWQvYXBpXCI7XG5pbXBvcnQge1JlbmRlclN0b3JlfSBmcm9tICdhbmd1bGFyMi9zcmMvd2ViX3dvcmtlcnMvc2hhcmVkL3JlbmRlcl9zdG9yZSc7XG5cbmNsYXNzIFByaW50TG9nZ2VyIHtcbiAgbG9nID0gcHJpbnQ7XG4gIGxvZ0Vycm9yID0gcHJpbnQ7XG4gIGxvZ0dyb3VwID0gcHJpbnQ7XG4gIGxvZ0dyb3VwRW5kKCkge31cbn1cblxuZXhwb3J0IGNvbnN0IFdPUktFUl9BUFBfUExBVEZPUk1fTUFSS0VSID1cbiAgICAvKkB0czJkYXJ0X2NvbnN0Ki8gbmV3IE9wYXF1ZVRva2VuKCdXb3JrZXJBcHBQbGF0Zm9ybU1hcmtlcicpO1xuXG5leHBvcnQgY29uc3QgV09SS0VSX0FQUF9QTEFURk9STTogQXJyYXk8YW55IC8qVHlwZSB8IFByb3ZpZGVyIHwgYW55W10qLz4gPVxuICAgIC8qQHRzMmRhcnRfY29uc3QqL1tcbiAgICAgIFBMQVRGT1JNX0NPTU1PTl9QUk9WSURFUlMsXG4gICAgICAvKkB0czJkYXJ0X2NvbnN0Ki8gKFxuICAgICAgICAgIC8qIEB0czJkYXJ0X1Byb3ZpZGVyICovIHtwcm92aWRlOiBXT1JLRVJfQVBQX1BMQVRGT1JNX01BUktFUiwgdXNlVmFsdWU6IHRydWV9KVxuICAgIF07XG5cbmV4cG9ydCBjb25zdCBXT1JLRVJfQVBQX0FQUExJQ0FUSU9OX0NPTU1PTjogQXJyYXk8YW55IC8qVHlwZSB8IFByb3ZpZGVyIHwgYW55W10qLz4gPVxuICAgIC8qQHRzMmRhcnRfY29uc3QqL1tcbiAgICAgIEFQUExJQ0FUSU9OX0NPTU1PTl9QUk9WSURFUlMsXG4gICAgICBGT1JNX1BST1ZJREVSUyxcbiAgICAgIFNlcmlhbGl6ZXIsXG4gICAgICAvKiBAdHMyZGFydF9Qcm92aWRlciAqLyB7cHJvdmlkZTogUExBVEZPUk1fUElQRVMsIHVzZVZhbHVlOiBDT01NT05fUElQRVMsIG11bHRpOiB0cnVlfSxcbiAgICAgIC8qIEB0czJkYXJ0X1Byb3ZpZGVyICovIHtwcm92aWRlOiBQTEFURk9STV9ESVJFQ1RJVkVTLCB1c2VWYWx1ZTogQ09NTU9OX0RJUkVDVElWRVMsIG11bHRpOiB0cnVlfSxcbiAgICAgIC8qIEB0czJkYXJ0X1Byb3ZpZGVyICovIHtwcm92aWRlOiBDbGllbnRNZXNzYWdlQnJva2VyRmFjdG9yeSwgdXNlQ2xhc3M6IENsaWVudE1lc3NhZ2VCcm9rZXJGYWN0b3J5X30sXG4gICAgICAvKiBAdHMyZGFydF9Qcm92aWRlciAqLyB7cHJvdmlkZTogU2VydmljZU1lc3NhZ2VCcm9rZXJGYWN0b3J5LCB1c2VDbGFzczogU2VydmljZU1lc3NhZ2VCcm9rZXJGYWN0b3J5X30sXG4gICAgICBXZWJXb3JrZXJSb290UmVuZGVyZXIsXG4gICAgICAvKiBAdHMyZGFydF9Qcm92aWRlciAqLyB7cHJvdmlkZTogUm9vdFJlbmRlcmVyLCB1c2VFeGlzdGluZzogV2ViV29ya2VyUm9vdFJlbmRlcmVyfSxcbiAgICAgIC8qIEB0czJkYXJ0X1Byb3ZpZGVyICovIHtwcm92aWRlOiBPTl9XRUJfV09SS0VSLCB1c2VWYWx1ZTogdHJ1ZX0sXG4gICAgICBSZW5kZXJTdG9yZSxcbiAgICAgIC8qIEB0czJkYXJ0X1Byb3ZpZGVyICovIHtwcm92aWRlOiBFeGNlcHRpb25IYW5kbGVyLCB1c2VGYWN0b3J5OiBfZXhjZXB0aW9uSGFuZGxlciwgZGVwczogW119LFxuICAgICAgV2ViV29ya2VyWEhSSW1wbCxcbiAgICAgIC8qIEB0czJkYXJ0X1Byb3ZpZGVyICovIHtwcm92aWRlOiBYSFIsIHVzZUV4aXN0aW5nOiBXZWJXb3JrZXJYSFJJbXBsfVxuICAgIF07XG5cbmZ1bmN0aW9uIF9leGNlcHRpb25IYW5kbGVyKCk6IEV4Y2VwdGlvbkhhbmRsZXIge1xuICByZXR1cm4gbmV3IEV4Y2VwdGlvbkhhbmRsZXIobmV3IFByaW50TG9nZ2VyKCkpO1xufVxuIl19