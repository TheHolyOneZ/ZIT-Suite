mod auth;
mod audit;
mod commands;
mod error;
mod github;
mod platform;
mod queue;
mod scheduler;
mod state;
mod tray;
mod workspace;

use tauri::Manager;

fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    use commands::{schedules as sch, deps as dp, branches as br, files as fl, insights as ins, audit as au, discover as dc, notifications as nt, ghrepo as gh, auth as a, collaborators as c, hooks as h, issues as i, secrets as sec, security as secu, workspace as ws, pulls as p, queue as q, repos as r, system as s};
    tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            a::auth_session,
            a::auth_sign_in_pat,
            a::auth_default_client_id,
            a::auth_device_start,
            a::auth_device_poll,
            a::auth_switch,
            a::auth_sign_out,
            a::github_rate_limit,
            r::orgs_list,
            r::repos_list,
            r::repos_languages,
            r::repos_export,
            q::queue_get,
            q::queue_dry_run,
            q::queue_submit,
            q::queue_start,
            q::queue_pause,
            q::queue_cancel,
            q::queue_skip,
            q::queue_retry_failed,
            q::queue_remove,
            q::queue_clear_finished,
            i::issues_search,
            i::issues_get,
            i::issues_create,
            i::issues_update,
            i::issues_set_locked,
            i::issues_comments,
            i::issues_comment_create,
            i::issues_comment_update,
            i::issues_comment_delete,
            i::issues_assignable,
            i::issues_timeline,
            i::issues_reactions,
            i::issues_react,
            i::issues_unreact,
            i::issues_extras,
            i::issues_set_pinned,
            i::issues_transfer,
            i::issues_sub_issues,
            i::issues_add_sub_issue,
            i::issues_remove_sub_issue,
            i::labels_list,
            i::labels_create,
            i::labels_update,
            i::labels_delete,
            i::milestones_list,
            i::milestones_create,
            i::milestones_update,
            i::milestones_delete,
            s::export_text_file,
            p::pulls_search,
            p::pulls_get,
            p::pulls_merge_settings,
            p::pulls_files,
            p::pulls_commits,
            p::pulls_reviews,
            p::pulls_submit_review,
            p::pulls_checks,
            p::pulls_update,
            p::pulls_set_draft,
            p::pulls_request_reviewers,
            p::pulls_branches,
            p::pulls_compare,
            p::pulls_create,
            p::pulls_set_auto_merge,
            p::pulls_review_comments,
            p::pulls_review_comment_create,
            p::pulls_review_comment_reply,
            p::pulls_review_comment_update,
            p::pulls_review_comment_delete,
            c::collab_scan,
            c::collab_access,
            c::collab_list,
            c::collab_invitations,
            c::collab_update_invitation,
            h::hooks_scan,
            h::hooks_list,
            h::hooks_patch,
            h::hooks_ping,
            h::hooks_test_push,
            h::hooks_deliveries,
            h::hooks_delivery,
            h::hooks_redeliver,
            h::hooks_health,
            sec::secrets_scan,
            sec::secrets_repo,
            secu::security_scan,
            secu::security_repo,
            s::read_secret_file,
            s::read_text_file,
            ws::ws_list,
            ws::ws_inspect,
            ws::ws_add,
            ws::ws_clone,
            ws::ws_open_terminal,
            ws::ws_open_editor,
            ws::ws_diff,
            ws::ws_undo_last,
            ws::ws_undo_since,
            ws::ws_park,
            ws::ws_parked,
            ws::ws_unpark,
            ws::ws_drop_parked,
            ws::ws_conflicts,
            ws::ws_resolve,
            ws::ws_update,
            ws::ws_remove,
            ws::ws_status,
            ws::ws_sync,
            ws::ws_history,
            ws::ws_commit,
            ws::ws_push,
            ws::ws_get_latest,
            ws::ws_branches,
            ws::ws_branch_create,
            ws::ws_branch_switch,
            ws::ws_tree,
            ws::ws_set_shared,
            ws::ws_gitignore,
            ws::ws_gitignore_save,
            ws::ws_ignore_add,
            ws::ws_suggestions,
            ws::ws_discard,
            ws::ws_add_workflow,
            ws::ws_read_workflow,
            ws::ws_recreate,
            ws::ws_save_workflow,
            ws::ws_delete_workflow,
            ins::insights_traffic,
            ins::insights_contributors,
            fl::files_tree,
            fl::files_blob,
            fl::files_history,
            fl::files_at_commit,
            fl::files_commit,
            fl::files_read_local,
            fl::files_scan_folder,
            fl::upload_plan,
            fl::upload_run,
            fl::files_blame,
            fl::files_dir,
            fl::files_read_text,
            r::repos_create,
            r::repos_gitignore_templates,
            r::repos_licenses,
            tray::tray_get_prefs,
            tray::tray_set_prefs,
            tray::tray_set_labels,
            tray::tray_set_status,
            tray::autostart_get,
            tray::autostart_set,
            sch::schedules_list,
            sch::schedule_save,
            sch::schedule_delete,
            sch::schedule_set_enabled,
            sch::schedules_claim_due,
            sch::schedule_run_now,
            sch::schedule_record,
            dp::deps_scan,
            dp::deps_latest,
            br::branches_list,
            br::branches_create,
            br::branches_rename,
            br::branches_set_default,
            br::branches_protection,
            br::branches_protect,
            br::branches_unprotect,
            br::branches_check_names,
            br::branches_rulesets,
            br::rulesets_get,
            br::rulesets_create,
            br::rulesets_update,
            br::rulesets_delete,
            au::audit_run,
            au::audit_local,
            au::audit_cache,
            au::audit_cache_clear,
            dc::gists_list,
            dc::gist_get,
            dc::gist_create,
            dc::gist_update,
            dc::gist_delete,
            dc::gist_star,
            dc::gist_revisions,
            dc::gist_comments,
            dc::gist_comment_add,
            dc::gist_comment_delete,
            dc::stars_list,
            dc::stars_set,
            dc::star_lists,
            dc::star_list_create,
            dc::star_list_delete,
            dc::star_set_lists,
            dc::search_run,
            nt::inbox_list,
            nt::inbox_act,
            nt::inbox_states,
            nt::inbox_read_all,
            nt::watched_list,
            nt::watch_set,
            gh::about_get,
            gh::about_save,
            gh::releases_list,
            gh::release_create,
            gh::release_update,
            gh::release_delete,
            gh::release_notes,
            gh::release_upload,
            gh::asset_delete,
            gh::tags_list,
            gh::tag_create,
            gh::tag_delete,
            gh::actions_workflows,
            gh::actions_runs,
            gh::actions_dispatch,
            gh::actions_rerun,
            gh::actions_cancel,
            gh::actions_set_enabled,
            gh::actions_source,
            gh::actions_jobs,
            gh::actions_job_log,
            gh::actions_artifacts,
            gh::actions_download_artifact,
            gh::actions_delete_run,
            gh::actions_overview,
            gh::releases_overview,
            gh::releases_unreleased,
        ])
        .events(tauri_specta::collect_events![
            crate::queue::QueueSnapshot,
            crate::queue::QueueFinished,
            r::ExportProgress,
            c::AccessScanProgress,
            h::HooksScanProgress,
            h::HooksHealthProgress,
            sec::SecretsScanProgress,
            secu::SecurityScanProgress,
            workspace::watcher::WorkspaceChanged,
            gh::ReleaseUploadProgress,
            fl::UploadProgress,
            au::AuditProgress,
            ins::TrafficProgress,
            gh::ActionsProgress,
            gh::ReleasesProgress,
            dp::DepsProgress,
            scheduler::ScheduleNudge,
            scheduler::SchedulesChanged,
            workspace::watcher::WorkspaceAutoCommit,
        ])
}


pub fn export_bindings() {
    specta_builder()
        .export(
            specta_typescript::Typescript::default()
                .bigint(specta_typescript::BigIntExportBehavior::Number)
                .header("// @ts-nocheck\n/* eslint-disable */"),
            concat!(env!("CARGO_MANIFEST_DIR"), "/../src/bindings.ts"),
        )
        .expect("failed to export typescript bindings");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    platform::init();
    let builder = specta_builder();
    #[cfg(debug_assertions)]
    export_bindings();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| tray::show(app)))

        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(tauri_plugin_window_state::StateFlags::all() & !tauri_plugin_window_state::StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec![tray::HIDDEN_ARG])))
        .on_window_event(tray::on_window_event)
        .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            let dir = app.path().app_data_dir()?;
            let cache = app.path().app_cache_dir()?.join("http");
            app.manage(state::AppState::load(dir, cache)?);

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                    let h = handle.clone();
                    let _ = tauri::async_runtime::spawn_blocking(move || h.state::<state::AppState>().save_caches()).await;
                }
            });
            scheduler::spawn_timer(app.handle().clone());
            tray::build(app.handle())?;
            tray::hide_on_start(app.handle());

            let st = app.state::<state::AppState>();
            let saved = st.workspaces.lock().unwrap().all().to_vec();
            for w in &saved {
                st.watchers.restart(app.handle(), w);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building ZIT-Suite")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                app.state::<state::AppState>().save_caches();
            }
        });
}

#[cfg(test)]
mod tests {
    #[test]
    fn export_typescript_bindings() {
        super::export_bindings();
    }
}
