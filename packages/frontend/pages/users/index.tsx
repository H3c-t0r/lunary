import DataTable from "@/components/Blocks/DataTable"

import { useAppUsersList } from "@/utils/dataHooks"
import { Group, Stack, Text } from "@mantine/core"

import { costColumn, timeColumn } from "@/utils/datatable"

import AppUserAvatar from "@/components/Blocks/AppUserAvatar"
import Empty from "@/components/Layout/Empty"
import { formatAppUser } from "@/utils/format"
import { IconUsers } from "@tabler/icons-react"
import { NextSeo } from "next-seo"
import Router from "next/router"
import analytics from "../../utils/analytics"

const columns = [
  {
    header: "User",
    size: 80,
    id: "users",
    cell: (props) => {
      const user = props.row.original
      return (
        <Group gap={8}>
          <AppUserAvatar size={30} user={user} />
          <Text fw={500}>{formatAppUser(user)}</Text>
        </Group>
      )
    },
  },
  timeColumn("createdAt", "First Seen"),
  timeColumn("last_seen", "Last Seen"),
  costColumn(),
]

export default function Users() {
  const { users, loading, loadMore, validating } = useAppUsersList()

  if (!loading && users?.length === 0) {
    return <Empty Icon={IconUsers} what="users" />
  }

  return (
    <Stack h={"calc(100vh - var(--navbar-with-filters-size))"}>
      <NextSeo title="Users" />

      <DataTable
        type="users"
        columns={columns}
        data={users}
        onRowClicked={(row) => {
          analytics.trackOnce("OpenUser")

          Router.push(`/users/${row.id}`)
        }}
        loading={loading || validating}
        loadMore={loadMore}
      />
    </Stack>
  )
}
