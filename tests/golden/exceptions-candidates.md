# 裁决例外词例句（2026-08-16 冻结）

> 用途（G2P.md §11-4）：为冻结后的例外词表（J5 cui/huic、§3-6 su- 词表、J13 hidden quantity、J6 重音例外）各提供 1–2 个真实例句。
> 例句取自已核实出处的公版原文；macron 为 agent 草案。
> **状态（2026-08-16）：已冻结（Athena 定案）**——itaque 例句已双源核实补入（见该节核实记录）；suam 反例槽位有意留空，保留为学生贡献任务。

## cui（J5：单音节双元音 [kʊj]）

Catullus 1.1（hendecasyllabic，cui 必须单音节才合格律）：

```text
Cui dōnō lepidum novum libellum
```

对照锚点：`cuius` 为两音节 [ˈkʊj.jʊs]（J8 复化；Chamberlain 惯例作 cujjus）。

## suādeō（§3-6：su- 词表 [sw]）

Vergil, Aeneid 2.9：

```text
suādentque cadentia sīdera somnos
```

- suādent = [ˈswaː.dɛnt]：u 不成音节核（若按 su-ā 两音节则音步不成立——格律自证）。
- 对照反例（suus 族必须排除）：**suam/suae/suō 等为两音节 [sʊ.am]**——例句槽位**有意留空（2026-08-16 Athena 定案，保留为学生贡献任务）**：从任意叙事文本选含 suam 的句子即可；规则要点：「sua」字符串匹配会同时命中 suādeō 族与 suus 族，必须词干级判定。

## cōnsul（J13：ns 前 hidden quantity）

Cicero, In Catilinam 1.2：

```text
Senātus haec intellegit, cōnsul videt; hic tamen vīvit.
```

- cōnsul = [ˈkoːn.sʊl]：ns 前长音正字法不可见，必须依赖 solver macron（信任模型实证）。
- 同句另含 `intellegit`（ĭn-tĕl-lĕ-gĭt：无 hidden quantity，作阴性对照）、`senātus`（ā ✓）。

## itaque（J6：重音例外，首音节重读 [ˈɪ.ta.kʷɛ]）

Cicero, De Officiis 1.13（句首连接副词用法）：

```text
Itaque cum sumus necessāriīs negōtiīs cūrīsque vacuī, tum avēmus aliquid vidēre, audīre, addiscere
```

- 出处核实（2026-08-16）：原文经**两个独立公版语料逐字符核对一致**（Latin Library 本 + 拉丁 Wikisource 本）。Gemini 外审（F20）原拟引文「De Off. 1.1: Itaque discēs tū quidem quam diū volēs」**经核不存在于 De Officiis——外审杜撰引文**，按「不杜撰引文」纪律弃用，替换为同书 1.13 实证文本（用法等价：句首连接副词）。
- macron 为 agent 草案（2026-08-16）：itaque 全短（ĭ-tă-quĕ）；necessāriīs / negōtiīs / cūrīsque / vacuī / avēmus / vidēre / audīre 按标准词汇量标出。
- 对照锚点：virúmque 型（Aen. 1.1，见样张 L1）——动词/名词 + -que 走 R3-4 enclitic 重音；ítaque 是副词，不走该规则。

## 补充锚点（已在 Aeneid 1.1–7 样张中覆盖，无需另选）

- mute+liquid（J4）：patrēs（1.7，pa.trēs 整体归后）。
- enclitic 重音（R3-4）：virúmque（1.1）、inferrétque（1.6）、Albānī́que（1.7）。
- hidden quantity（J13）：īnferretque（1.6）、lītora（1.3，lītus 的 ī）、Ītaliam（1.2，Ī）。
- gn → [ŋn]（J2）：可参考 Catullus 101.6 indignē（见 elegiac-candidates.md）。
