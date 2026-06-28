<template>
  <div class="notifications-page">
    <van-nav-bar title="消息通知" left-arrow @click-left="router.back()">
      <template #right>
        <van-icon name="checked" size="18" @click="onMarkAllRead" />
      </template>
    </van-nav-bar>

    <!-- 通知列表 -->
    <van-empty v-if="list.length === 0" description="暂无通知" />
    <van-list
      v-else
      v-model:loading="loading"
      :finished="finished"
      finished-text="没有更多了"
      @load="onLoad"
    >
      <van-cell-group inset>
        <van-swipe-cell v-for="item in list" :key="item.id">
          <van-cell
            :title="item.title"
            :label="item.createdAt"
            clickable
            @click="onRead(item)"
          >
            <template #icon>
              <van-badge :dot="!item.isRead" style="margin-right: 8px">
                <van-icon name="bell" size="20" />
              </van-badge>
            </template>
            <template #value>
              <van-tag v-if="!item.isRead" type="danger" size="medium">未读</van-tag>
            </template>
          </van-cell>
          <template #right>
            <van-button square type="danger" text="删除" class="delete-btn" @click="onDelete(item)" />
          </template>
        </van-swipe-cell>
      </van-cell-group>
    </van-list>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { deleteNotification, getNotifications, markAsRead, markAllAsRead } from '../../api/notification'

const router = useRouter()
const list = ref<any[]>([])
const loading = ref(false)
const finished = ref(false)
const page = ref(1)
const pageSize = 20

/** 加载通知列表 */
async function onLoad() {
  try {
    const res = await getNotifications({ page: page.value, pageSize }) as any
    const pageData = res.data || res || {}
    const data = pageData.records || []
    if (data.length === 0) {
      finished.value = true
    } else {
      list.value.push(...data)
      page.value++
    }
  } catch {
    finished.value = true
  } finally {
    loading.value = false
  }
}

onLoad()

/** 标记已读 */
async function onRead(item: any) {
  if (!item.isRead) {
    try {
      await markAsRead(item.id)
      item.isRead = true
    } catch {
      // 静默处理
    }
  }
}

/** 全部标记已读 */
async function onMarkAllRead() {
  try {
    await markAllAsRead()
    list.value.forEach((item) => {
      item.isRead = true
    })
    showToast('已全部标记为已读')
  } catch {
    showToast('操作失败')
  }
}

/** 删除通知 */
async function onDelete(item: any) {
  try {
    await showConfirmDialog({ title: '删除通知', message: '确定要删除这条通知吗？' })
  } catch {
    return
  }
  try {
    await deleteNotification(item.id)
    list.value = list.value.filter((row) => row.id !== item.id)
    showToast('已删除')
  } catch {
    showToast('删除失败')
  }
}
</script>

<style scoped lang="scss">
.notifications-page {
  min-height: 100vh;
  background: #f5f5f5;
}

.delete-btn {
  height: 100%;
}
</style>
