# Wander Map 实现路线

## 1. 技术栈

推荐：

```text
Vue 3
TypeScript
Vite
MapLibre GL JS
Terra Draw
Pinia
Dexie / idb
Vue Router
PWA plugin
Graph library: Cytoscape.js / Sigma.js（二选一）
Testing: Vitest + Playwright
```

推荐优先使用 Dexie 包装 IndexedDB，以减少事务、索引和 migration 的样板代码。

整体仍保持普通 TypeScript domain layer，避免让 Dexie 类型渗透整个项目。

---

## 2. 目录结构

建议：

```text
src/
├── app/
│   ├── router/
│   └── bootstrap/
│
├── domain/
│   ├── place/
│   ├── connection/
│   ├── journey/
│   ├── transit/
│   ├── time/
│   └── share/
│
├── repositories/
│   ├── interfaces/
│   └── indexeddb/
│
├── providers/
│   ├── basemap/
│   ├── search/
│   ├── routing/
│   ├── transit/
│   └── coordinate/
│
├── map/
│   ├── controller/
│   ├── layers/
│   ├── sources/
│   ├── drawing/
│   └── styles/
│
├── graph/
├── timeline/
├── share/
├── import-export/
├── stores/
├── views/
├── components/
└── utils/
```

原则：

> `domain` 不 import Vue、MapLibre、IndexedDB 或具体地图服务 SDK。

---

## 3. 第一步：建立 Domain Schema

第一阶段先不碰复杂 UI，先把数据结构固定下来。

完成：

- Coordinate
- Place
- Connection
- TransitInfo
- Journey
- TimeRule
- SharePackage
- AppSettings

同时加入：

```ts
schemaVersion: number
```

并为所有实体统一：

```ts
id
createdAt
updatedAt
```

ID 推荐使用 UUID v7 或 ULID，便于未来同步与排序。

### 验收

能够在纯 TypeScript 测试中：

1. 创建地点
2. 连接两个地点
3. 创建 Journey
4. 序列化为 JSON
5. 再反序列化

---

## 4. 第二步：Repository 与 IndexedDB

建立 repository interfaces：

```ts
interface PlaceRepository {
  get(id: string): Promise<Place | undefined>
  list(): Promise<Place[]>
  put(place: Place): Promise<void>
  delete(id: string): Promise<void>
}
```

其它实体同理。

IndexedDB 表建议：

```text
places
connections
journeys
assets
settings
meta
```

`meta` 保存数据库 schema 和 migration 状态。

### 索引

Places：

- category
- visitState
- updatedAt

Connections：

- fromPlaceId
- toPlaceId
- mode

Journeys：

- startedAt
- updatedAt

### 验收

- 刷新页面后数据仍存在
- 能正常完成 CRUD
- migration 测试可以将旧 schema 升级到当前版本

---

## 5. 第三步：MapLibre 基础地图

先完成纯地图层：

- 初始化 MapLibre
- 默认 OpenFreeMap style
- 保存 camera state
- 地图主题配置
- Zoom / rotate / locate controls

定义一个 `MapController`，不要让 Vue Component 到处直接操作 map instance。

例如：

```ts
interface MapController {
  setPlaces(places: Place[]): void
  setConnections(connections: Connection[]): void
  setJourneys(journeys: Journey[]): void
  setTime(time: Date): void
  fitBounds(...): void
}
```

### GeoJSON Source

建议维护少量共享 source，而不是每一个地点一个 Marker。

例如：

```text
places-source
connections-source
journeys-source
temporary-source
```

大量地点使用 MapLibre Symbol / Circle Layer。

只有选中地点或特殊交互才用 DOM Marker。

### 验收

1000 个 Place 仍能平滑缩放、过滤和点击。

---

## 6. 第四步：Place 完整工作流

实现：

1. 长按 / 双击地图
2. 创建 Place
3. Bottom Sheet 编辑
4. 分类 / 标签
5. 备注
6. 推荐时间
7. 营业时间
8. visit state
9. 删除 / 归档

点击地图已有地点后：

```text
Place Preview
├── name
├── tags
├── current status
├── next transit warning
└── actions
    ├── edit
    ├── connect
    ├── start journey
    └── share
```

### 搜索

同时接入 SearchProvider interface，但第一版只实现一个公共 Provider + Manual。

搜索结果只作为临时层；用户点击“保存”后才进入 Place Repository。

---

## 7. 第五步：Connection 与地图绘制

实现两种创建方式。

### Manual Connection

用户选择：

```text
Place A → Add Connection → Place B
```

填写：

- mode
- duration
- cost
- note
- first / last departure

geometry 可以为空，也可以由用户手绘。

### Draw Route

接入 Terra Draw：

```text
Start drawing
→ LineString
→ Save as Connection geometry
```

允许后续编辑节点。

### Auto Route

实现 RoutingProvider 接口。

返回结果先放入 temporary layer，用户确认后才保存为 Connection。

这避免外部 API 返回值直接污染个人数据。

---

## 8. 第六步：Transit

第一版目标不是制作完整公交查询软件，而是让公共交通成为 Connection 的时间增强信息。

实现：

- Metro / Bus mode
- lineName
- first / last departure
- serviceDays
- manual timetable
- warning calculation

例如：

```ts
getConnectionAvailability(connection, now)
```

返回：

```text
available
closing-soon
unavailable
unknown
```

### GTFS

在 Provider interface 中保留，但第一版可以只支持导入小型 GTFS 数据集或后续加入。

不要为了 GTFS 阻塞第一版。

---

## 9. 第七步：时间系统

建立独立 `TimeEngine`：

```ts
interface TimeEngine {
  getPlaceState(place: Place, at: Date): PlaceTimeState
  getConnectionState(connection: Connection, at: Date): ConnectionTimeState
}
```

状态不要直接写死在 UI 中。

Map View 根据 TimeEngine 输出：

- filter
- opacity
- icon state
- warning

增加时间滑块：

```text
Now / Custom time
```

第一版可以以 15 分钟为步长。

### 验收

切到 23:30 时：

- 已关闭地点自动降权显示
- 已无末班车的连接呈 unavailable
- closing-soon 能正确提示

---

## 10. 第八步：Journey

实现 Journey Editor。

用户可以：

```text
Create Journey
→ Add Place
→ Add Connection
→ Add Place
→ ...
```

也可以从已有地图关系中选择。

Journey 页面展示：

- Map route
- Step list
- time
- photos
- notes

Journey 保存后同时可以参与 Heatmap / history 统计。

---

## 11. 第九步：Graph View

Graph 数据直接派生：

```ts
nodes = places
edges = connections
```

第一版 Graph View 支持：

- pan / zoom
- 点击节点跳回 Map View
- 按交通方式过滤 edge
- 按地点类型过滤 node
- 高亮某节点的一跳 / 两跳邻居

不要一开始做自动图分析算法。

Graph View 重点是“另一个观察数据的方式”。

推荐 Cytoscape.js，因为：

- graph interaction 成熟
- layout 丰富
- 对一般规模个人数据足够

---

## 12. 第十步：Heatmap 与统计

Heatmap 输入从 Journey / visit metadata 派生。

第一版权重可以简单定义：

```text
weight = visitCount
```

之后再加入：

- recency decay
- dwell time
- rating

注意：Heatmap 不需要后台 GPS。

可以增加基础统计：

- 高频地点
- 常用交通方式
- 最近访问区域
- Journey 数量

---

## 13. 第十一步：Import / Export

建立稳定的数据包格式：

```ts
interface WanderArchive {
  schemaVersion: number
  exportedAt: string
  places: Place[]
  connections: Connection[]
  journeys: Journey[]
  settings?: PortableSettings
}
```

导入流程：

```text
Parse
→ Validate
→ Migrate
→ Preview changes
→ Merge / Replace
→ Commit transaction
```

禁止直接 JSON.parse 后全量写入。

需要 schema validation，可使用 Zod。

---

## 14. 第十二步：静态分享

### Share Composer

用户选择：

- Places
- Connections
- Journeys
- 图层默认状态
- 地图 camera

生成 SharePackage。

### URL 编码

流程：

```text
SharePackage
→ JSON
→ optional compact transform
→ compression
→ base64url
→ URL fragment
```

推荐：

- `CompressionStream('gzip')` 或轻量压缩库
- base64url

页面进入分享模式后：

```text
/map#data=...
```

只读，不写入主数据库，除非用户明确点击“Import into my atlas”。

### URL 长度保护

如果超过阈值：

- 提示导出 `.wander.json`
- 后续再接短链接服务

---

## 15. 第十三步：PWA 与移动端

PWA：

- manifest
- app icons
- standalone mode
- service worker
- cache application shell

移动端交互重点：

- Map 占主屏
- Bottom Sheet 而不是 modal
- 长按创建地点
- 单手操作区域放底部
- 支持 Safari Add to Home Screen

第一版不承诺完整离线底图，只保证：

- 应用壳可离线启动
- 已有个人数据可离线查看
- 底图不可用时仍显示自定义内容的降级界面

---

## 16. Provider 实现顺序

### Basemap

第一版：

1. OpenFreeMap
2. Custom Style URL

随后：

3. MapTiler
4. PMTiles

### Search

建议：

1. Nominatim / MapTiler 任选一个简单公开实现
2. AMap adapter

### Routing

1. Manual
2. OpenRouteService
3. AMap

### Transit

1. Manual
2. GTFS adapter
3. 区域 Provider

这样应用从第一天起不会依赖任何单一第三方 API 才能工作。

---

## 17. 中国大陆 Provider 注意事项

核心数据库保持 WGS84。

建立：

```ts
interface CoordinateTransformer {
  fromCanonical(coord: Coordinate): ProviderCoordinate
  toCanonical(coord: ProviderCoordinate): Coordinate
}
```

AMap adapter 内处理 GCJ-02。

测试必须覆盖：

- WGS84 → GCJ-02 → WGS84 round-trip
- 搜索结果落点
- 路线 geometry 转换

任何地图 Provider 的坐标系统都不得泄漏进 Domain。

---

## 18. 状态管理

Pinia 不应该保存所有业务数据副本。

推荐 store 只管理：

- 当前选中地点
- 当前时间
- 当前地图视图
- layer visibility
- 当前编辑状态
- temporary search / route preview

真实长期数据由 repositories 提供。

这样可以避免：

```text
IndexedDB state
vs
Pinia state
```

出现双重真相源。

---

## 19. 性能策略

### 地图

- 使用 GeoJSON source + layer
- 避免大量 DOM markers
- 更新数据时批量生成 FeatureCollection
- 对非常大量的数据再考虑 vector tiles

### IndexedDB

- 用索引查询
- 不在启动时加载所有照片 blob

### Graph

- 默认只渲染当前过滤后的节点
- 数据规模变大后再引入 graph clustering

### Share

- 压缩前移除无关字段
- 照片默认不塞进 URL

---

## 20. 测试路线

### Unit Tests

重点覆盖：

- TimeEngine
- coordinate transform
- schema migration
- share serialization
- import validation
- Connection availability

### Integration Tests

覆盖：

- Repository CRUD
- Provider adapter
- Map source generation

### E2E

Playwright：

1. 新建地点
2. 刷新后仍存在
3. 连接两个地点
4. 创建 Journey
5. 时间滑块改变状态
6. 导出 JSON
7. 生成分享 URL
8. 在新页面打开分享 URL

---

## 21. 开发顺序建议

虽然第一版包含完整功能，但实现仍然应按依赖顺序推进。

```text
Phase 0
项目骨架 + lint + tests + PWA shell

Phase 1
Domain + IndexedDB + migrations

Phase 2
MapLibre + OpenFreeMap + Place CRUD

Phase 3
Search + Connection + Terra Draw

Phase 4
Routing Provider + Transit manual data

Phase 5
TimeEngine + time slider

Phase 6
Journey

Phase 7
Graph View

Phase 8
Heatmap + statistics

Phase 9
Import / Export + Share URL

Phase 10
AMap / alternate providers + coordinate adapters

Phase 11
Mobile polish + performance + E2E
```

这里的 Phase 是实现顺序，不代表要拆成多个正式版本。

第一版发布时可以一次性包含 Phase 0–11。

---

## 22. 推荐的最早可运行切片

虽然不对外发布残缺 MVP，但开发过程中最好尽早获得一条垂直切片：

```text
打开 PWA
→ MapLibre 显示底图
→ 长按创建 Place
→ 保存 IndexedDB
→ 刷新后仍显示
→ 导出 JSON
```

这是第一个稳定里程碑。

第二个垂直切片：

```text
Place A
→ Connection
→ Place B
→ 设置末班时间
→ 时间滑到末班之后
→ Connection 状态变化
```

它能验证项目最有特色的“空间 + 关系 + 时间”模型。

---

## 23. 初始开发任务清单

第一批可以直接交给 Agent 的任务：

1. 初始化 Vue 3 + TypeScript + Vite 项目。
2. 配置 Vitest、Playwright、ESLint、Prettier。
3. 配置 PWA shell。
4. 创建 `domain/` 全部基础类型。
5. 创建 Zod schemas。
6. 创建 Dexie database 和 repositories。
7. 写 schema migration 框架。
8. 接入 MapLibre + OpenFreeMap。
9. 创建 MapController。
10. 将 Place 映射到 GeoJSON source。
11. 实现地图长按新增 Place。
12. 实现 Place Bottom Sheet。
13. 写第一组 E2E。

完成这 13 项之后再接路线、时间和 Graph，能显著减少同时调试太多模块的风险。

---

## 24. 架构上需要坚持的约束

实现过程中建议把以下内容写进项目 AGENTS.md / CONTRIBUTING.md：

1. Domain 层不依赖 Vue、MapLibre、IndexedDB 或具体 Provider SDK。
2. 所有内部坐标使用 WGS84。
3. Provider 返回值必须经过 adapter 转换成 Domain 类型。
4. 外部搜索 / 路线结果不会自动进入用户数据库。
5. Manual provider 永远是一等能力。
6. Repository 是长期数据的唯一入口。
7. Share View 默认只读。
8. 所有持久化格式必须带 schemaVersion。
9. 新字段必须考虑 migration。
10. Local-first 模式不可因加入云功能而退化。

---

## 25. 第一版完成标准

当以下流程均能稳定工作，可以认为第一版完成：

### 地点

- 创建 / 编辑 / 搜索 / 标签 / 删除

### 移动关系

- 手工连接
- 绘制路线
- 自动路线
- 公交 / 地铁信息

### 时间

- opening hours
- 推荐时间
- 首末班
- 时间滑块
- availability 状态

### 漫游记录

- Journey 创建与展示

### 多视图

- Map
- Graph
- Heatmap

### 数据自主性

- IndexedDB
- JSON Import / Export
- schema migration

### 分享

- 选择性 SharePackage
- URL fragment 只读分享

### 平台体验

- PWA
- 桌面 / 手机响应式
- 基础离线启动

---

## 26. 后续扩展优先级

第一版之后，比较值得继续做的是：

1. 场景推荐 / reachability 查询
2. GTFS 导入
3. PMTiles 离线区域包
4. 照片 EXIF 辅助创建地点
5. WebDAV / E2EE 多设备同步
6. Journey 自动统计
7. 分享模板与主题
8. 可选实时公交

其中“场景推荐”最能体现现有数据模型的价值，因为它真正利用了 Place + Connection + Time，而不是单纯新增一个页面。
