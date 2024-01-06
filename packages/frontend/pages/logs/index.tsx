import DataTable from "@/components/Blocks/DataTable"

import {
  ActionIcon,
  Button,
  Card,
  Drawer,
  Flex,
  Group,
  Menu,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
} from "@mantine/core"

import {
  costColumn,
  durationColumn,
  feedbackColumn,
  inputColumn,
  nameColumn,
  outputColumn,
  tagsColumn,
  timeColumn,
  userColumn,
} from "@/utils/datatable"
import {
  IconBraces,
  IconBrandOpenai,
  IconDotsVertical,
  IconFileExport,
  IconFilter,
  IconListTree,
  IconMessages,
} from "@tabler/icons-react"
import { NextSeo } from "next-seo"
import { useContext, useEffect, useState } from "react"

import FiltersModal from "@/components/Blocks/FiltersModal"
import { ChatReplay } from "@/components/Blocks/RunChat"
import RunInputOutput from "@/components/Blocks/RunInputOutput"
import SearchBar from "@/components/Blocks/SearchBar"
import { openUpgrade } from "@/components/Layout/UpgradeModal"
import analytics from "@/utils/analytics"
import { formatDateTime } from "@/utils/format"
import {
  useCurrentProject,
  useModelNames,
  useOrg,
  useProjectInfiniteSWR,
  useUser,
} from "@/utils/newDataHooks"
import { useDebouncedState, useLocalStorage, useSetState } from "@mantine/hooks"
import Router from "next/router"
import FacetedFilter from "../../components/Blocks/FacetedFilter"
import Empty from "../../components/Layout/Empty"
import { ProjectContext } from "../../utils/context"

const columns = [
  timeColumn("createdAt"),
  nameColumn("Model"),
  durationColumn(),
  userColumn(),
  {
    header: "Tokens",
    size: 40,
    id: "tokens",
    sortingFn: (a, b) => a.tokens.total - b.tokens.total,
    cell: (props) => props.getValue(),
    accessorFn: (row) => row.tokens.total,
  },
  costColumn(),
  feedbackColumn(),
  tagsColumn(),
  inputColumn("Prompt"),
  outputColumn("Result"),
]

const tracesColumns = [
  timeColumn("createdAt", "Time"),
  nameColumn("Agent"),
  durationColumn(),
  userColumn(),
  feedbackColumn(true),
  tagsColumn(),
  inputColumn("Input"),
  outputColumn(),
]

const chatsColumns = [
  timeColumn("createdAt", "Started at"),
  durationColumn("full"),
  userColumn(),
  inputColumn("Last Message"),
  tagsColumn(),
  feedbackColumn(true),
]

function buildExportUrl(
  projectId: string,
  query: string | null,
  models: string[],
  tags: string[],
) {
  const url = new URL("/api/generation/export", window.location.origin)

  url.searchParams.append("projectId", projectId)

  if (query) {
    url.searchParams.append("search", query)
  }

  if (models.length > 0) {
    url.searchParams.append("models", models.join(","))
  }

  if (tags.length > 0) {
    url.searchParams.append("tags", tags.join(","))
  }

  return url.toString()
}

export default function Logs() {
  const [selectedFilters, setSelectedFilters] = useSetState({})
  const [isModalOpened, setIsModalOpened] = useState(false)
  const [views, setViews] = useLocalStorage({
    key: "views",
    defaultValue: [],
  })
  const [currentView, setCurrentView] = useState()
  const {
    data: logs,
    loading,
    validating,
    loadMore,
  } = useProjectInfiniteSWR("/runs?type=llm")
  const threads = useProjectInfiniteSWR("/runs?type=thread")
  const traces = useProjectInfiniteSWR("/runs?type=trace")

  const [selectedTab, setSelectedTab] = useState("llm-call")

  useOrg()
  const { user } = useUser()

  useEffect(() => {
    if (currentView) {
      setSelectedFilters(currentView.filters)
    }
  }, [currentView, setSelectedFilters])

  let { modelNames } = useModelNames()
  const [query, setQuery] = useDebouncedState(null, 500)

  const [selectedModels, setSelectedModels] = useState([])
  const [selectedTags, setSelectedTags] = useState([])

  const { projectId } = useContext(ProjectContext)
  const { project, loading: projectLoading } = useCurrentProject()

  const { org } = useOrg()
  const [selected, setSelected] = useState(null)

  const exportUrl = projectId
    ? buildExportUrl(projectId, query, selectedModels, selectedTags)
    : ""

  const [selectedChatItems, setSelectedChatItems] = useState([])

  useEffect(() => {}, [selectedTab])

  if (!loading && !projectLoading && !project?.activated) {
    return <Empty Icon={IconBrandOpenai} what="requests" />
  }

  function exportButton(url: string) {
    if (org?.plan !== "free") {
      return {
        href: url,
        component: "a",
        onClick: () => {
          analytics.trackOnce("ClickExport")
        },
      }
    } else {
      return {
        onClick: () => {
          analytics.trackOnce("ClickExport")
          openUpgrade("export")
        },
      }
    }
  }

  function apply(items) {
    setSelectedFilters(items)
    setIsModalOpened(false)
  }

  function createView() {
    const name = prompt("Name")

    if (name) {
      const newViews = [...views, { name, filters: selectedFilters }]

      setViews(newViews)
    }
  }

  return (
    <>
      <FiltersModal
        opened={isModalOpened}
        setOpened={setIsModalOpened}
        defaultSelected={selectedFilters}
        save={apply}
      />
      <Stack h={"calc(100vh - var(--navbar-with-filters-size))"}>
        <NextSeo title="Requests" />

        <Stack>
          <Card withBorder p={4} px="sm">
            <Flex justify="space-between">
              <SearchBar
                query={query}
                ml={-8}
                setQuery={setQuery}
                variant="unstyled"
                size="sm"
              />

              <Group gap="xs">
                <Button
                  variant="subtle"
                  onClick={() => setIsModalOpened(true)}
                  leftSection={<IconFilter size={12} />}
                  size="xs"
                >
                  Add filters
                </Button>
                <SegmentedControl
                  value={selectedTab}
                  size="xs"
                  w="fit-content"
                  onChange={setSelectedTab}
                  data={[
                    {
                      label: (
                        <Group gap="xs" wrap="nowrap" mx="xs">
                          <IconBrandOpenai
                            size="16px"
                            color="var(--mantine-color-blue-5)"
                          />
                          <Text size="xs">LLM</Text>
                        </Group>
                      ),
                      value: "llm-call",
                    },

                    {
                      label: (
                        <Group gap="xs" wrap="nowrap" mx="xs">
                          <IconListTree
                            size="16px"
                            color="var(--mantine-color-blue-5)"
                          />
                          <Text size="xs">Traces</Text>
                        </Group>
                      ),
                      value: "trace",
                    },

                    {
                      label: (
                        <Group gap="xs" wrap="nowrap" mx="xs">
                          <IconMessages
                            size="16px"
                            color="var(--mantine-color-blue-5)"
                          />
                          <Text size="xs">Threads</Text>
                        </Group>
                      ),
                      value: "chat",
                    },
                  ]}
                />

                <Menu withArrow shadow="sm" position="bottom-end">
                  <Menu.Target>
                    <ActionIcon variant="light">
                      <IconDotsVertical size={12} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<IconFileExport size={16} />}
                      {...exportButton(exportUrl)}
                    >
                      Export to CSV
                    </Menu.Item>
                    <Menu.Item
                      color="dark"
                      disabled
                      leftSection={<IconBraces size={16} />}
                      // {...exportButton(exportUrl)}
                    >
                      Export to JSONL
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            </Flex>
          </Card>
          {Object.entries(selectedFilters).length > 0 && (
            <Paper px="xs" p={4}>
              <Flex justify="space-between">
                <Group>
                  {Object.entries(selectedFilters).map(
                    ([filterName, selected]) =>
                      selected && (
                        <FacetedFilter
                          key={filterName}
                          name={
                            filterName.charAt(0).toUpperCase() +
                            filterName.slice(1)
                          }
                          items={modelNames}
                          selectedItems={selectedModels}
                          setSelectedItems={setSelectedModels}
                        />
                      ),
                  )}
                </Group>
                <Group gap="xs">
                  <Select
                    placeholder="Load a view..."
                    size="xs"
                    w={100}
                    variant="unstyled"
                    value={currentView?.name}
                    onChange={(viewName) =>
                      setCurrentView(
                        views.find(({ name }) => name === viewName),
                      )
                    }
                    data={views.map((view) => view.name)}
                  />

                  {Object.values(selectedFilters).length > 0 && (
                    <>
                      <Button onClick={createView} size="compact-xs">
                        Save View
                      </Button>
                      <Button
                        onClick={() => setSelectedFilters({})}
                        variant="outline"
                        size="compact-xs"
                      >
                        Clear
                      </Button>
                    </>
                  )}
                </Group>
              </Flex>
            </Paper>
          )}
        </Stack>

        <Drawer
          opened={!!selected}
          size="xl"
          keepMounted
          position="right"
          title={selected ? formatDateTime(selected.createdAt) : ""}
          onClose={() => setSelected(null)}
        >
          {selected?.type === "llm" && (
            <RunInputOutput
              initialRun={selected}
              withPlayground={true}
              withShare={true}
            />
          )}

          {selected?.type === "thread" && <ChatReplay run={selected} />}
        </Drawer>

        {selectedTab === "llm-call" && (
          <DataTable
            type="llm"
            onRowClicked={(row) => {
              analytics.trackOnce("OpenRun")
              setSelected(row)
            }}
            loading={loading || validating}
            loadMore={loadMore}
            columns={columns}
            data={logs}
          />
        )}

        {selectedTab === "trace" && (
          <DataTable
            type="traces"
            columns={tracesColumns}
            data={traces.logs}
            loadMore={traces.loadMore}
            loading={traces.loading || traces.validating}
            onRowClicked={(row) => {
              analytics.track("OpenTrace")

              Router.push(`/traces/${row.id}`)
            }}
          />
        )}

        {selectedTab === "chat" && (
          <DataTable
            type="chats"
            onRowClicked={(row) => {
              analytics.trackOnce("OpenChat")
              // Router.push(`/chats?chat=${row.id}`)
              // setSelectedChat(row)
              setSelected(row)
            }}
            loading={threads.loading || threads.validating}
            loadMore={threads.loadMore}
            columns={chatsColumns}
            data={threads.logs}
          />
        )}
      </Stack>
    </>
  )
}
