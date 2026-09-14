# Airtable → ACF mapping: observed source and first contract

2026-09-13 · Read-only discovery completed · Target WordPress schema remains proposed.

The configured Airtable CLI now works. The supplied base has **16 tables and 176 fields**. Its Pages table has two draft records, but the exact supplied **Grid view contains only Lead Generation (`SERV-LG`)**. That distinction determines import scope.

The source already models templates, sections, Figma references and content-slot mappings. Build on that structure. It does not yet contain a complete executable ACF mapping, an implemented WP schema or an explicit taxonomy model.

Artifacts: [draft mapping contract](../contracts/company-airtable-acf-map.v0.1.json), [observed schema inventory](airtable-schema-snapshot.json), [company POC](../POC-01-company-site.md).

## Evidence and scope

- Base: `appctrC0fkefkHeK8`; Pages: `tblyECInojqSB7WF2`; supplied view: `viw8b0xz2WntKE3Xd` / **Grid view**. [Open source view](https://airtable.com/appctrC0fkefkHeK8/tblyECInojqSB7WF2/viw8b0xz2WntKE3Xd?blocks=hide)
- Read all table/field definitions, detailed select/link configuration, Templates, Section Registry and all 56 Field Map records. Read content records from every content table; the initial logo sample was followed by the complete seven-record library.
- The CLI record tool does not expose a view parameter. The exact view membership was separately verified through Airtable's official read API with `view` and no sorting override. It returned one record, with no further page. The API supports view-based membership and ordering; reading a whole table is not equivalent. [Airtable list-records documentation](https://airtable.com/developers/web/api/list-records)
- No Airtable records, schemas, files, automation settings or comments were changed. No WordPress import or schema deployment ran. Figma references were read as metadata; the referenced designs were not revalidated in this pass.

## Recommended first slice

| Property | Observed value |
| --- | --- |
| Page | Lead Generation; UID `SERV-LG`; record `rec5dU04B6EArakgp` |
| Slug / state | `lead-generation` / Draft |
| Page Type | Services |
| Template | Services — Large; slug `serv-lg`; record `recJ0Kl58TnxrsRHX` |
| ACF group label in source | `serv_lg_flexible_content` — a label in Airtable, not a verified deployed field-group key |
| Figma reference | File `rehvt8QIcCqbh85p1OtCmP`, node `1048:1530` |
| Template composition | Seven body sections, then global navigation/footer |
| Reported mapping state | Template says Mapped, with 56 slots, 7 gaps and 7 copy drifts |

The other Pages record, `TEAM-AUSTINFOUST`, is outside the selected view. It must not become a root import through an unrestricted table read or reverse relationship traversal. Use a separately created WP-owned draft fixture to test Stellar editorial writes; the source team page can test exclusion without being imported.

## Target model by table

Counts describe the observed base, including empty records. Every target below is a proposal for the company schema.

| Airtable table | Records | Proposed WP/ACF role |
| --- | ---: | --- |
| Pages | 2; 1 in selected view | Built-in WP `page` for the selected Services page, with ACF template/composition fields. Future Page Types need explicit routing/model rules. |
| Templates | 1 | Versioned template manifest and ACF group mapping; not public site content. |
| Section Registry | 11; 8 named | Registered ACF layout/component contracts. Seven selected body layouts; one global entry; three empty rows excluded. |
| Field Map | 56 | Source/target wiring and design-reference evidence. Normalize to typed bindings; do not publish it as CMS content. |
| Case Studies | 3; 2 populated | Shared `case_study` CPT, related from the page's two case slots. Initially expose only required fields, with public detail routes deferred. |
| Testimonials | 1 | Shared `testimonial` CPT with quote, attribution, company and imported logo. |
| Services Team | 2 | Shared `content_section` entity for the selected `SERV-TEAM-MASTER` record; ACF heading/body and role fields. Preserve shared identity. |
| Niche Spaces | 3; 1 populated | Shared `content_section` entity for `SERV-NICHE-MASTER`; ACF heading/body and three industry-content groups. Its prose is not a taxonomy definition. |
| Approach Sections | 2 | Page-owned ACF fields inside Reach Higher; selected `SERV-LG-APPROACH`. Preserve the three numbered heading/Markdown pairs. |
| Get Started | 2 | Page-owned Hire Intelligence ACF fields; selected `START-LEADGEN`, CTA pairs and resource links. |
| Site Settings | 2 | Allowlisted ACF options: `closing_tagline` and `client_logo_bar`. |
| Clients-Logos | 7 | WP media plus option-linked logo metadata. Global logo bar references five client records; two agency brand logos are separate and not implicitly included. |
| Team Profiles | 1 | Future team page/profile fields or CPT if independent reuse warrants it. Excluded from this page's declared dependency graph. |
| Approach Columns | 0 | Exclude from POC. Current content uses numbered fields on Approach Sections. |
| Industry Cards | 0 | Exclude from POC. Current content uses numbered fields on Niche Spaces. |
| Account Team | 0 | Exclude from POC; not required by the selected template. |

Section Registry explicitly classifies Services Team and Niche Spaces as **Shared library**, despite their section-shaped content. A private `content_section` CPT is one proposed way to retain shared identity and updates. Copying their data into unrelated page rows would need an explicit snapshot/override policy. Page-specific Approach/Get Started fields can be embedded while retaining their source record IDs.

The empty child tables have retirement proposals in Field Map notes. Those notes are source data, not instructions to delete anything. Likewise, instructions in the notes about changing copy, adding Figma nodes or moving fields are outstanding proposals, not approval to perform those actions.

## Selected section mapping

Use the order of the Templates.Sections links to write explicit ordinals into the versioned template manifest. The page's direct Section Registry field is empty, so it cannot be the order source for this record.

| Order | Source section key | Existing proposed ACF layout / Astro component names | Source → target fields |
| --- | --- | --- | --- |
| 1 | `hero` | `section_hero` / `Hero.astro` | Pages `HERO-EYEBROW`, `HERO-H1`, `HERO-CONTENT` → eyebrow, heading, body. |
| 2 | `featured-case-studies` | `section_featured_case_studies` / `FeaturedCaseStudies.astro` | `CASE-HEAD` plus ordered `CASE-1`, `CASE-2` relationships. Resolve CASE-FLEX and CASE-SENSOR to reusable WP IDs. |
| 3 | `reach-higher` | `section_reach_higher` / `ReachHigher.astro` | Pages `SERV-HED-1`, `SERV-HED-2`, `SERV-CONTENT`; linked Approach Section `APPROACH-TITLE`, `APP-HEAD-1..3`, `APP-CONTENT-1..3`. |
| 4 | `your-team` | `section_your_team` / `YourTeam.astro` | Relationship to the shared Services Team record; heading, body and four numbered role title/body pairs. Image-field treatment remains unresolved. |
| 5 | `niche-spaces` | `section_niche_spaces` / `NicheSpaces.astro` | Relationship to the shared Niche Spaces record; heading, body and three numbered heading/Markdown pairs. |
| 6 | `testimonial` | `section_testimonial` / `Testimonial.astro` | Relationship to TEST-CHEMCON; `TEST-QUOTE`, `TEST-ATTRIBUTE`, `TEST-COMPANY`, `TEST-LOGO`. |
| 7 | `hire-intelligence` | `section_hire_intelligence` / `HireIntelligence.astro` | Linked Get Started record: subhead, heading, body, CTA label/URL pairs and TXT/MD/CSV/HTML resource URLs. |
| Global | `global-chrome` | No ACF layout or Astro component recorded | Navigation/footer mapping is unfinished; Site Settings supplies global values/logo references, not a body layout. |

The contract has **71 source-field bindings** with IDs checked against the observed schema. Target paths and group/field keys remain proposals. Register and verify actual ACF keys and WPGraphQL exposure before an executor can use this contract. ACF Flexible Content here is a content layout mechanism; it does not require Gutenberg or ACF Blocks.

## Taxonomy mapping remains a separate decision

No observed table defines taxonomy terms, term IDs or post/term assignments. The base supports designing those mappings, but does not yet supply a confirmed source.

- `Page Type` currently holds Services, Landing, Resource, Team Member and Other; it is a renderer/content-type discriminator, not automatically a public taxonomy. The draft validates this page's `Services` choice against `serv-lg` and rejects unknown combinations rather than silently selecting a post type.
- `Status` is editorial state; `Parent` is a single select with no choices or selected values. Neither establishes a taxonomy.
- Niche Spaces contains headings such as Life Sciences, Manufacturing and Enterprise Technology, plus prose and bullet lists. These could inform a future `industry` taxonomy after approval, but do not establish canonical terms, hierarchy, URLs or assignments today.

The user has been asked which classifications to use. Once specified, add ACF taxonomy definitions, attach them to the intended post types, create an explicit term source/mapping with stable identities, then map assignments. Keep canonical industry terms separate from the marketing copy displayed in a section. The draft JSON intentionally leaves definitions/assignments empty and marks this requirement unresolved; it is not a claim that the required taxonomy capability is complete.

## Fix before treating Field Map as executable

Field Map has **31 “1-to-1”, 6 “Split”, 7 “No node”, 5 “Global chrome” and 7 “Copy drift”** records. These are recorded source states, not independently verified design results.

Several “Airtable Field ID” cells contain expressions: two field IDs joined with `+`, a page link followed by `→` and a child field, a field ID followed by “and 3 more”, or a table ID in place of a field ID. Normalize these to arrays of typed field references and explicit relationship paths. Multi-table Content Table ID cells likewise need arrays. Never pass the raw strings to ACF or evaluate them as code.

Allowlist transformations such as text, Markdown, link pairs, ordered record references and attachment imports. Two styled headings are separate source fields consumed by a component; Figma styled-text operations do not belong in a WP import executor. Markdown can contain links, but the observed bullet labels often have no destinations; do not invent URLs.

Case Studies `Pages 2` and `Pages 2 copy` are the schema-confirmed inverses of Pages `CASE-1` and `CASE-2`. Their names are confusing, but they are distinct slot backlinks. Treat Pages' forward links as authoritative for this composition, and exclude the legacy Case Studies `Pages` text field from writes. Do not merge or delete these columns during import.

## Source quality and release readiness

The source supports a draft import/readback proof now. Faithful visual review and publication still require decisions or content completion:

| Finding | Observed evidence / required treatment |
| --- | --- |
| Missing content | `CASE-HEAD` is blank; all four selected team-card body fields are blank; `closing_tagline` exists without Value; secondary CTA label and URL are blank. “1-to-1” mappings do not prove populated values. |
| Placeholder destinations | The selected Get Started resource links and primary CTA point to `https://google.com`; CASE-SENSOR uses it too. Preserve source provenance, but reject these as final publish destinations. |
| Missing bullet URLs | Approach/Niche content has plain bullet labels where mapping notes describe linked UI elements. Resolve actual destinations or choose an explicitly non-link presentation. |
| Copy concerns | Observed text includes “Progammatic” and additional manufacturing bullets in Enterprise Technology content. Field Map records seven copy drifts; review the intended copy instead of automatically rewriting it to match old notes. |
| Image/design differences | Four Services Team image fields reference the same Icon.png; notes question their use. Testimonial source contains the Brand Black logo variant while its note describes a different design variant. Resolve against the actual approved design. |
| Global composition | Navigation/footer is marked Unmapped. Existing Site Settings does not define the needed navigation tree or footer content. The client-logo bar does have five resolvable logo records in explicit link order. |
| Hierarchy/cardinality | Pages.Parent is not a linked parent model, and Templates permits multiple links even though this page has one. The importer needs explicit singleton/cardinality and parent-resolution validation. |

The reported seven gaps/seven drifts are not a complete completeness score. Blank values, placeholder links, unavailable target schema and taxonomy omissions need their own validation results. Keep import/schema validity, source-content approval, Figma parity and release authorization separate.

## Bounded dependency and acceptance plan

1. Seed only the selected Lead Generation root. Follow its declared links to two case studies, one testimonial, one approach record, one shared team section, one shared niche section and one Get Started record; include required media and explicitly allowlisted global settings/logos.
2. Do not recursively follow inverse page links or Case Studies.Team Profiles into the excluded team page. Unrelated digital-marketing sections, empty records and unselected brand logos stay outside the import.
3. Deploy the approved ACF definitions, resolve stable source identities to WP IDs, seed as drafts and read back through WPGraphQL. No-op replay preserves timestamps and media identity. Reconcile partial operations without publishing incomplete pages.
4. Render one responsive template through Astro, preserving references and source field provenance. Validate draft exclusion and denied writes to Airtable-owned fields. Use a separate WP-owned fixture for editable-content tests.
5. Resolve the publication findings, taxonomy contract and global UI before marking the full template ready for release. Use the existing staging pipelines; successful source discovery alone is not an implemented POC.
