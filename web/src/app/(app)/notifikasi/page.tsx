"use client";

import { useEffect, useState } from "react";
import Topbar from "@/components/layout/Topbar";
import Card from "@/components/ui/Card";
import NotificationItem from "@/components/notifikasi/NotificationItem";
import { Notification } from "@/lib/types";
import { mockNotifications } from "@/lib/mock-data";
import { api } from "@/lib/api";

export default function NotifikasiPage() {
  const [notifications, setNotifications] =
    useState<Notification[]>(mockNotifications);

  useEffect(() => {
    api
      .getNotifications()
      .then(setNotifications)
      .catch(() => setNotifications(mockNotifications));
  }, []);

  return (
    <>
      <Topbar
        title="Notifikasi & Prediksi"
        subtitle="Riwayat peringatan kondisi aktual dan hasil prediksi kualitas air"
      />

      <div className="flex-1 p-5 sm:p-8">
        <Card className="p-0">
          {notifications.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">
              Belum ada notifikasi.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => (
                <NotificationItem key={n.id} item={n} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
