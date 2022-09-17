import {
  open,
  FileSystemItem,
  ActionPanel,
  List,
  Action,
  getDefaultApplication,
  getApplications,
  // getSelectedFinderItems,
  showToast,
  Toast,
  Application,
  Icon,
  closeMainWindow,
  popToRoot,
} from "@raycast/api";
import { useEffect, useState, Fragment } from "react";
import { basename } from "node:path";
import { runAppleScript } from "run-applescript";

export default function Command() {
  const [fullList, setFullList] = useState(false);
  const { items, loading: itemsLoading } = useSelectedFinderItems();
  const { app: defaultApp } = useDefaultApplication(items);
  const { apps: compatibleApps = [], loading: compatibleLoading } = useCompatibleApplications(items);
  const { apps: allApps } = useAllApplications(fullList);

  const apps = fullList ? (allApps.length ? allApps : compatibleApps) : compatibleApps;

  return (
    <List
      isLoading={itemsLoading || (Boolean(items.length) && compatibleLoading)}
      enableFiltering
      onSearchTextChange={(text) => setFullList(Boolean(text))}
      searchBarPlaceholder={
        items.length === 0 ? "Open selected finder items with..." : `Open ${getFileString(items)} with...`
      }
    >
      {items.length ? (
        <CompatibleApplications files={items} apps={apps} defaultApp={defaultApp} recommended={compatibleApps} />
      ) : null}
      {!fullList && Boolean(items.length) ? (
        <List.EmptyView
          title={`No app compatible with all ${items.length} file${items.length > 1 ? "s" : ""} was found`}
          description="Start typing to search through all available applications"
        />
      ) : undefined}
    </List>
  );
}

function CompatibleApplications({
  files,
  apps,
  defaultApp,
  recommended,
}: {
  files: FileSystemItem[];
  apps: Application[];
  defaultApp?: Application;
  recommended: Application[];
}) {
  return (
    <Fragment>
      {apps.map((app) => (
        <List.Item
          title={app.name}
          key={app.bundleId || app.path}
          accessories={
            defaultApp && app.path === defaultApp.path
              ? [{ text: `Default`, icon: Icon.Bookmark }]
              : recommended.some(({ path }) => path === app.path)
              ? [{ text: `Compatible`, icon: Icon.CheckCircle }]
              : undefined
          }
          actions={<ApplicationActions files={files} app={app} />}
          icon={{ fileIcon: app.path }}
        />
      ))}
    </Fragment>
  );
}

function ApplicationActions({ files, app }: { files: FileSystemItem[]; app: Application }) {
  return (
    <ActionPanel>
      <Action
        title={`Open ${getFileString(files)} with ${app.name}`}
        onAction={() => {
          files.forEach((file) => {
            open(file.path, app);
          });
          closeMainWindow();
          popToRoot({ clearSearchBar: true });
        }}
      />
    </ActionPanel>
  );
}

function getFileString(files: FileSystemItem[]) {
  if (files.length === 1) {
    return basename(files[0].path);
  }
  if (files.length === 0) {
    return "";
  }
  return `${files.length} files`;
}

function useAllApplications(off: boolean) {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (off) {
      return;
    }
    let cancel = false;
    void (async function () {
      setLoading(true);
      try {
        const allApps = await getApplications();
        if (!cancel) {
          setApps(allApps || []);
          setLoading(false);
        }
      } catch (error) {
        if (!cancel) {
          setLoading(false);
          await showToast({
            style: Toast.Style.Failure,
            title: "Cannot get compatible applications for selected items",
            message: String(error),
          });
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [off]);
  return { apps, loading };
}

function useCompatibleApplications(files: FileSystemItem[]) {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (files.length === 0) {
      setApps([]);
      return;
    }
    let cancel = false;
    void (async function () {
      setLoading(true);
      try {
        const appsTable = await Promise.all(files.map((file) => getApplications(file.path)));
        if (!cancel) {
          const inCommon = appsTable.reduce(
            (accu, apps) => accu.filter((app) => apps.find(({ path }) => path === app.path)),
            appsTable[0] || []
          );
          setApps(inCommon);
          setLoading(false);
        }
      } catch (error) {
        if (!cancel) {
          setLoading(false);
          await showToast({
            style: Toast.Style.Failure,
            title: "Cannot get compatible applications for selected items",
            message: String(error),
          });
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [files]);
  return { apps, loading };
}

function useDefaultApplication(files: FileSystemItem[]) {
  const [app, setApp] = useState<Application | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (files.length === 0) {
      setApp(undefined);
      return;
    }
    let cancel = false;
    void (async function () {
      setLoading(true);
      try {
        const defaultApplications = await Promise.all(files.map((file) => getDefaultApplication(file.path)));
        if (!cancel) {
          const allIdentical = defaultApplications.every(({ path }) => path === defaultApplications[0].path);
          if (allIdentical) setApp(defaultApplications[0]);
          else setApp(undefined);
          setLoading(false);
        }
      } catch (error) {
        if (!cancel) {
          setLoading(false);
          await showToast({
            style: Toast.Style.Failure,
            title: "Cannot get default applications for selected items",
            message: String(error),
          });
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [files]);
  return { app, loading };
}

function useSelectedFinderItems() {
  const [items, setItems] = useState<FileSystemItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancel = false;
    void (async function () {
      setLoading(true);
      try {
        // const selectedItems = await getSelectedFinderItems();
        const selectedItems = await customGetSelectedFinderItems();
        if (!cancel) {
          setLoading(false);
          setItems(selectedItems);
        }
      } catch (error) {
        if (!cancel) {
          setLoading(false);
          await showToast({
            style: Toast.Style.Failure,
            title: "Cannot get selected finder items",
            message: String(error),
          });
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  return { items, loading };
}

/**
 * As opposed to `@raycast/api/getSelectedFinderItems`, this script
 * is able to grab Finder selection even if Finder isn't the
 * currently focused app
 */
async function customGetSelectedFinderItems(): Promise<FileSystemItem[]> {
  // The applescript below returns a string with a list of the items
  // selected in Finder separated by return characters
  const applescript = `
  tell application "Finder"
    set theItems to selection
  end tell
  set itemsPaths to ""
  repeat with itemRef in theItems
    set theItem to POSIX path of (itemRef as string)
    set itemsPaths to itemsPaths & theItem & return
  end repeat
  return itemsPaths
  `;

  const response = await runAppleScript(applescript);

  return response.split("\r").map((path) => ({ path }));
}
