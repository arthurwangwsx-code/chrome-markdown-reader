# SA Diagram Regression

This fixture mirrors diagram shapes found in real technical-design evaluation output while keeping all
business content synthetic and safe for the public repository.

## Mermaid module relationships

```mermaid
flowchart TB
    subgraph Frontend["Frontend"]
        List["订单列表页"]
        Filter["当前筛选条件 month"]
        Export["管理员导出入口与请求状态"]
    end
    subgraph Backend["Server"]
        ListAPI["GET /api/orders"]
        ExportAPI["PROPOSED export endpoint"]
    end
    List --> Filter
    Filter --> ListAPI
    Filter --> Export
    Export --> ExportAPI
    style Export fill:#ffcdd2,stroke:#c62828
    style ExportAPI fill:#ffcdd2,stroke:#c62828
```

## Mermaid page flow

```mermaid
flowchart LR
    list["订单列表页"] -->|点击导出当前筛选结果| pending["导出请求中状态"]
    pending -->|成功：触发下载| list
    pending -->|失败：展示错误并允许重试| list
```

## Mermaid confirmed and uncertain navigation

```mermaid
flowchart LR
    pageA["页面A"] -->|点击动作| pageB["页面B"]
    pageB -.->|待确认: 触发| pageC["页面C"]
```

## Mermaid mixed navigation sources

```mermaid
flowchart LR
    empty["实体-空"] -->|点击新建（截图可见按钮）| create["实体-创建"]
    list["实体-列表"] -->|点击行（需求述）| detail["实体-详情"]
    create -->|保存成功| list
    list -.->|待确认: 资料未见入口| import["导入弹层"]
```

## Mermaid styled module chain

```mermaid
flowchart TB
    NewMod["新增模块"]
    CoreMod["核心/高风险模块"]
    OldMod["已有未变(上下文)"]
    OldMod --> CoreMod --> NewMod
    style NewMod fill:#c8e6c9
    style CoreMod fill:#ffcdd2,stroke:#c62828
```

## Mermaid compact architecture

```mermaid
flowchart TB
    subgraph Frontend["前端"]
        Page["页面"]
        Component["核心/高风险组件"]
    end
    subgraph Backend["服务端"]
        API["接口"]
    end
    Page --> Component --> API
    style Component fill:#ffcdd2,stroke:#c62828
```

## PlantUML use case with colored notes

```plantuml
@startuml
left to right direction
actor "Administrator" as admin
actor "Non-admin User" as user
(Order List) as list
(Apply Current Filter) as filter
(Export Current Filtered Orders) as export
(Pending State and Disable Button) as pending
(Download or Receive Export Result) as success
(Failure Message and Retry) as retry
(List Remains Available) as fallback

admin --> list : Enter page
list --> filter : Existing list query
filter --> export : Click export
export --> pending : submit request once
pending --> success : success
pending ..> retry : failure
retry --> export : retry with same filter
user --> list : Enter page
list ..> fallback : no export permission or feature disabled

note right of export #ffcdd2 : <color:#c62828>High risk - permission boundary</color>
note right of pending #c8e6c9 : NEW - pending state
note right of retry #c8e6c9 : NEW - retry
note right of fallback #fff59d : MODIFIED - keep list available
@enduml
```

## PlantUML compact use case

```plantuml
@startuml
left to right direction
actor "User" as user
(EntryPage) as entry
(State1) as s1
(CoreAction) as a1
user --> entry : Enter page
entry --> s1 : First state
s1 --> a1 : click action
note right of a1 #c8e6c9 : NEW
note right of s1 #ffcdd2 : <color:#c62828>⚠️ 高风险</color>
@enduml
```

## PlantUML sequence with autonumber and branches

```plantuml
@startuml
autonumber
actor "User" as user
participant "View (OrderList)" as view
participant "Logic (useOrderExport)" as hook
participant "Server" as server

user -> view : 点击 Export
activate view
view -> hook : onExport(currentFilter)
activate hook
hook -> hook : guard role/isAdmin and featureEnabled
hook -> hook : if loading return; set status=LOADING
hook -> server : call export API with current filter
activate server
alt success
  server --> hook : return export result
  deactivate server
  hook -> hook : sanitize logs; set status=SUCCESS
  hook --> view : trigger download or success message
else error FORBIDDEN_OR_EXPORT_FAILED
  server --> hook : return error
  deactivate server
  hook -> hook : map error; set status=ERROR
  hook --> view : render error message + Retry
end
deactivate hook
deactivate view
note right of hook #ffcdd2 : <color:#c62828>High risk - state guard</color>
note right of server #ffcdd2 : <color:#c62828>High risk - authorization boundary</color>
@enduml
```

## PlantUML template placeholders and Unicode arrow

```plantuml
@startuml
autonumber
actor "User" as user
participant "View ([组件名])" as view
participant "Logic (use[XXX])" as hook
participant "Server" as server
user -> view : [用户操作]
view -> hook : [意图方法，如 onSubmit()]
hook -> hook : set status=LOADING
hook -> server : call api /path/to/api.json
alt success
  server --> hook : return [key fields]
  hook -> hook : set status=SUCCESS
  hook --> view : [驱动渲染的状态] → [可观察成功 UI]
else error [ERROR_CODE]
  server --> hook : return error [ERROR_CODE]
  hook -> hook : map errorCode → 文案/操作
  hook --> view : [可观察错误 UI]
end
note right of hook #c8e6c9 : NEW
note right of server #ffcdd2 : <color:#c62828>⚠️ 高风险(如有)</color>
@enduml
```

## PlantUML localized retry flow

```plantuml
@startuml
autonumber
actor "User" as user
participant "View (ErrorPage)" as view
participant "Logic (useErrorRecovery)" as hook
participant "Server" as server

user -> view : 点击 Retry
view -> hook : onRetry()
hook -> hook : set status=LOADING
hook -> server : call api /api/resource/view.json
alt success
  server --> hook : 返回 resource 数据
  hook -> hook : set status=SUCCESS
  hook --> view : 渲染内容
else error TOKEN_EXPIRED
  server --> hook : 返回 errorCode=TOKEN_EXPIRED
  hook -> hook : map errorCode → 文案/操作
  hook --> view : 渲染"链接已过期"错误页 + 重试按钮
end
note right of hook #c8e6c9 : NEW - 统一错误恢复逻辑
note right of server #ffcdd2 : <color:#c62828>⚠️ 高风险 - token 失效鉴权分支</color>
@enduml
```
