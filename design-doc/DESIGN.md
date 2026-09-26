# Wander Map / Personal Atlas 设计文档

## 1. 项目定位

Wander Map 是一个面向个人日常活动与城市漫游的地图应用。它不以“导航软件”或“地点收藏夹”为目标，而是用于记录和组织：

- 常去地点与想去地点
- 地点之间的交通与步行连接
- 首末班车、营业时间等时间信息
- 个人推荐、备注、照片与标签
- 一次完整的出行 / 漫游 Journey
- 随时间积累形成的个人活动范围与城市记忆
- 可选择部分内容生成只读分享链接

一句话定义：

> A personal map for places, routes and everyday movement.
>
> 一张记录“你如何在城市里生活”的地图。

项目第一版直接覆盖核心完整体验，而不是只做“打点 MVP”。

---

## 2. 设计原则

### 2.1 个人知识优先

公共地图服务负责提供底图、搜索和可选路线规划，但应用保存的是“用户自己的地图知识”。

例如：

- “这家店凌晨一点半才关门”
- “23:05 之后我通常不会再坐这班地铁”
- “这条路晚上照明更好”
- “这家店比地图入口实际更适合从东门进”

这些信息不应被公共地图 API 覆盖。

### 2.2 地图服务与核心数据解耦

地图渲染、POI 搜索、路径规划、公共交通数据分别抽象成 Provider。

应用内部的数据模型与某一家地图厂商无关。

### 2.3 Local-first

默认不需要账号与后端：

- 数据保存在本地 IndexedDB
- 支持 JSON 导入 / 导出
- 分享时仅导出用户主动选择的数据
- 静态部署即可运行

### 2.4 时间是一等公民

地点并不是静态点。地点与连接都可以具有时间属性：

- 营业时间
- 推荐时间
- 首末班车
- 服务日
- 夜间安全提示
- 某个时间后是否仍可返回

因此时间过滤不是附属功能，而是核心视图能力。

### 2.5 地图与图谱是同一份数据的不同视图

Map View 回答“在哪里”。

Graph View 回答“如何连接”。

两者共享 Place / Connection / Journey 等领域数据。

---

## 3. 核心领域模型

## 3.1 Place

表示一个用户关心的地点。

示例：

- 地铁站
- 饭店
- 公园
- 拍照点
- 学校
- 某个路口
- “这里晚上风很好”这种自定义地点

建议字段：

```ts
interface Place {
  id: string
  name: string
  coordinate: Coordinate

  category: PlaceCategory
  tags: string[]

  description?: string
  rating?: number
  note?: string
  photos?: AssetRef[]

  visitState: 'wishlist' | 'visited' | 'frequent' | 'archived'

  openingHours?: TimeRule[]
  recommendedTimes?: TimeRule[]

  visibility: 'private' | 'shareable'

  createdAt: string
  updatedAt: string
}
```

坐标内部统一使用 WGS84，外部 Provider 自行完成坐标转换。

---

## 3.2 Connection

表示两个地点之间的移动关系。

```ts
interface Connection {
  id: string
  fromPlaceId: string
  toPlaceId: string

  mode:
    | 'walk'
    | 'bike'
    | 'metro'
    | 'bus'
    | 'taxi'
    | 'drive'
    | 'train'
    | 'custom'

  geometry?: GeoJSON.LineString

  durationMinutes?: number
  distanceMeters?: number
  cost?: number

  transit?: TransitInfo
  note?: string

  source: 'manual' | 'routing-provider' | 'transit-provider'

  createdAt: string
  updatedAt: string
}
```

Connection 的重点不是“导航路径”，而是个人意义上的“我通常怎么从 A 到 B”。

---

## 3.3 TransitInfo

```ts
interface TransitInfo {
  lineName?: string
  operator?: string

  firstDeparture?: LocalTime
  lastDeparture?: LocalTime

  serviceDays?: Weekday[]
  timetable?: TimetableEntry[]

  note?: string
}
```

Transit 信息允许完全手工填写，也允许从 GTFS / 地图供应商导入后再由用户覆盖。

---

## 3.4 Journey

Journey 表示一次完整的出行或漫游记录。

```ts
interface Journey {
  id: string
  title: string

  startedAt?: string
  endedAt?: string

  steps: JourneyStep[]

  note?: string
  photos?: AssetRef[]
  tags: string[]

  visibility: 'private' | 'shareable'
}
```

步骤可以引用 Place 和 Connection，也允许存在临时节点。

示例：

```text
学校
  ↓ walk
地铁站
  ↓ metro
新街口
  ↓ walk
饭店
  ↓ walk
河边
```

---

## 3.5 TimeRule

统一表达：

- 营业时间
- 推荐访问时段
- 公交服务时间
- 特定日期例外

第一版不必实现完整 iCalendar 语义，但应该保留可扩展结构。

```ts
interface TimeRule {
  days?: Weekday[]
  start?: string
  end?: string
  validFrom?: string
  validUntil?: string
  note?: string
}
```

---

## 4. 地图视图

## 4.1 Map View

默认主视图。

图层建议：

```text
Basemap
├── Place Layer
│   ├── food
│   ├── scenic
│   ├── transit
│   ├── favorite
│   └── wishlist
│
├── Connection Layer
│   ├── walk
│   ├── bike
│   ├── metro
│   └── bus
│
├── Journey Layer
├── Heatmap Layer
└── Temporary Layer
    ├── Search Results
    └── Route Preview
```

功能：

- 点选 / 长按创建 Place
- 编辑点位
- 手工绘制路线
- 搜索后保存地点
- 过滤图层
- 时间滑块
- Journey 播放 / 查看
- Heatmap
- 分享视图预览

---

## 4.2 Graph View

将 Place 作为节点，Connection 作为边。

适合回答：

- 哪些地点经常连在一起？
- 哪个地铁站是我的主要枢纽？
- 哪些地点只能打车回来？
- 我实际形成了哪些活动圈？

Graph View 不维护独立数据，只从同一领域模型派生。

---

## 4.3 Timeline / Time Filter

地图顶部或底部提供时间滑块。

例如：

```text
18:00 ───── 22:00 ───── 02:00
```

时间改变后：

- 已关闭地点变灰或隐藏
- 已错过末班车的连接显示警告
- 当前推荐地点高亮
- Journey 可按实际时间回放

---

## 4.4 Heatmap

Heatmap 不依赖持续 GPS 追踪。

可根据：

- 访问次数
- 最近访问时间
- 停留时长
- 用户评分

生成个人活动热力图。

这样隐私成本更低，也更符合“主动记录”的产品定位。

---

## 5. 搜索与路线

### 5.1 Search Provider

```ts
interface SearchProvider {
  search(query: string, context?: SearchContext): Promise<SearchResult[]>
  reverseGeocode?(coordinate: Coordinate): Promise<SearchResult | null>
}
```

实现可包括：

- AMap
- MapTiler
- Nominatim
- 自定义 Provider

---

### 5.2 Routing Provider

```ts
interface RoutingProvider {
  route(request: RouteRequest): Promise<RouteResult[]>
}
```

实现可包括：

- OpenRouteService
- AMap
- Manual

Manual Route 是正式能力，不是 fallback。

用户可以直接绘制“自己喜欢走的路线”。

---

### 5.3 Transit Provider

```ts
interface TransitProvider {
  getNearbyStops?(coordinate: Coordinate): Promise<TransitStop[]>
  getSchedule?(stopId: string): Promise<TransitSchedule>
  getRoute?(from: Coordinate, to: Coordinate): Promise<TransitPlan[]>
}
```

实现：

- Manual
- GTFS
- AMap 等区域服务

手工信息优先级应高于 Provider 导入信息。

---

## 6. 地图技术方案

### 核心渲染

使用 **MapLibre GL JS**。

原因：

- 开源
- 不绑定地图供应商
- 支持矢量瓦片与 GeoJSON
- 图层表达能力强
- 支持 Heatmap、聚合、动态过滤
- 适合大量自定义数据
- 后续可扩展 3D / terrain / PMTiles

### 默认底图

首选 **OpenFreeMap**。

优点：

- 无 API Key
- 适合静态部署
- 与 MapLibre 配合直接
- 后续可替换

### 可选底图

```text
BasemapProvider
├── OpenFreeMap
├── MapTiler
├── PMTiles
└── Custom Style URL
```

### 地图绘制

使用 Terra Draw 或兼容 MapLibre 的绘图插件处理：

- Point
- LineString
- Polygon
- 自定义路线编辑

---

## 7. 坐标系统

内部唯一 canonical coordinate：**WGS84**。

Provider 层负责转换。

例如：

```text
Internal DB: WGS84

AMap Adapter:
WGS84 → GCJ-02 → API
API → GCJ-02 → WGS84 → Domain
```

任何 GCJ-02 / BD-09 坐标都不能直接写入核心领域数据。

---

## 8. Local-first 存储

第一版采用 IndexedDB。

建议封装 Repository：

```ts
interface PlaceRepository {}
interface ConnectionRepository {}
interface JourneyRepository {}
interface SettingsRepository {}
```

不要让 UI 直接调用 IndexedDB。

数据能力包括：

- 自动本地保存
- JSON 导出
- JSON 导入
- 数据迁移版本号
- 可选备份

---

## 9. 分享模型

分享不是共享整个数据库，而是生成一个 **Share Package**。

```ts
interface SharePackage {
  version: number
  title: string
  description?: string

  places: Place[]
  connections: Connection[]
  journeys?: Journey[]

  initialView?: MapViewState
}
```

生成方式：

### 小型数据

压缩后写入 URL fragment：

```text
/map#data=...
```

优点：

- 无后端
- 链接本身就是数据
- 服务端无法读取 fragment

### 大型数据

后续可支持：

- 静态 JSON 文件
- GitHub Gist
- Cloudflare Worker / KV
- 自建同步服务器

第一版只实现 URL + JSON 文件即可。

---

## 10. 导入 / 导出

导入导出格式必须有显式版本：

```json
{
  "schemaVersion": 1,
  "places": [],
  "connections": [],
  "journeys": []
}
```

后续升级数据库时通过 migration 保持兼容。

可进一步定义 `.wander.json` 作为项目文件格式。

---

## 11. 第一版功能范围

第一版直接实现：

- MapLibre 地图
- 地点创建、编辑、删除
- 搜索 POI 并保存
- 自定义标签与分类
- 地点营业 / 推荐时间
- Connection
- 手绘路线
- 自动路线 Provider
- 公交 / 地铁连接
- 首末班车手工信息
- Journey
- 地图图层开关
- 时间过滤
- Graph View
- Heatmap
- JSON 导入导出
- 静态分享 URL
- PWA
- 移动端适配

第一版暂不要求：

- 用户账号
- 多设备实时同步
- 社交网络
- 后台 GPS 持续记录
- 完整离线世界地图
- 实时公交

这些保留扩展接口即可。

---

## 12. 产品扩展方向

### 场景推荐

在已有数据基础上计算：

> 现在 22:40，我想逛一个小时，还有哪些地方值得去而且能回来？

依赖：

- 当前时间
- Place 推荐时间
- opening hours
- Connection
- last departure

这会成为产品很有特色的一层能力。

### 地区地图包

未来可通过 PMTiles 做：

- 南京包
- 东京包
- 台湾包

用于离线 / 半离线浏览。

### 私有同步

后续再增加可选服务端：

- WebDAV
- S3-compatible storage
- 自建 API
- E2EE sync

但不能破坏 Local-first 模式。

---

## 13. 推荐 UI 信息架构

移动端主导航可设计成：

```text
Map | Journeys | Graph | Library | Settings
```

Map：当前地图与操作入口

Journeys：出行记录

Graph：关系视图

Library：地点、路线、标签的列表管理

Settings：地图 Provider、导入导出、显示偏好

地图页底部使用 Bottom Sheet 承载地点详情与编辑，避免频繁跳页面。

---

## 14. 项目特色总结

Wander Map 与传统地图收藏工具的区别不在于“可以添加 Marker”，而在于：

1. Place、Connection、Journey 共同描述个人移动方式。
2. 时间信息是一等公民。
3. 用户自己的经验可以覆盖公共地图数据。
4. Map / Graph / Timeline 是同一数据的多个视图。
5. 默认 Local-first，无账号也能完整使用。
6. 分享的是经过选择的个人地图，而不是账户本身。
7. 系统关注“我怎么使用这座城市”，而不仅是“城市里有什么”。
