using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ours.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SplitWantsBetweenCoupleMembers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Couples_Accounts_WantsAccountId",
                table: "Couples");

            migrationBuilder.DropForeignKey(
                name: "FK_Distributions_Accounts_WantsAccountId",
                table: "Distributions");

            migrationBuilder.DropIndex(
                name: "IX_Distributions_WantsAccountId",
                table: "Distributions");

            migrationBuilder.DropIndex(
                name: "IX_Couples_WantsAccountId",
                table: "Couples");

            migrationBuilder.DropColumn(
                name: "WantsAccountId",
                table: "Distributions");

            migrationBuilder.DropColumn(
                name: "WantsAccountId",
                table: "Couples");

            migrationBuilder.AddColumn<Guid>(
                name: "WantsAccountId",
                table: "CoupleMembers",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "WantsAllocationPercent",
                table: "CoupleMembers",
                type: "numeric(5,2)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_CoupleMembers_WantsAccountId",
                table: "CoupleMembers",
                column: "WantsAccountId");

            migrationBuilder.AddForeignKey(
                name: "FK_CoupleMembers_Accounts_WantsAccountId",
                table: "CoupleMembers",
                column: "WantsAccountId",
                principalTable: "Accounts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CoupleMembers_Accounts_WantsAccountId",
                table: "CoupleMembers");

            migrationBuilder.DropIndex(
                name: "IX_CoupleMembers_WantsAccountId",
                table: "CoupleMembers");

            migrationBuilder.DropColumn(
                name: "WantsAccountId",
                table: "CoupleMembers");

            migrationBuilder.DropColumn(
                name: "WantsAllocationPercent",
                table: "CoupleMembers");

            migrationBuilder.AddColumn<Guid>(
                name: "WantsAccountId",
                table: "Distributions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "WantsAccountId",
                table: "Couples",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Distributions_WantsAccountId",
                table: "Distributions",
                column: "WantsAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_Couples_WantsAccountId",
                table: "Couples",
                column: "WantsAccountId");

            migrationBuilder.AddForeignKey(
                name: "FK_Couples_Accounts_WantsAccountId",
                table: "Couples",
                column: "WantsAccountId",
                principalTable: "Accounts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Distributions_Accounts_WantsAccountId",
                table: "Distributions",
                column: "WantsAccountId",
                principalTable: "Accounts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
